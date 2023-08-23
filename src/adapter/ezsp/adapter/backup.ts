/* istanbul ignore file */
import Debug from "debug";
import {Driver} from '../driver';
import * as Models from "../../../models";
import {EmberKeyType, EmberKeyStruct, EmberNetworkParameters, EmberInitialSecurityState, EzspStatus, 
    EmberStatus, EzspValueId, EmberJoinMethod, EmberZDOCmd, EmberApsOption, EmberEUI64, EzspConfigId, EmberKeyData} from '../driver/types';
import {channelsMask2list} from '../driver/utils';
import {fs} from "mz";
import {ember_security} from '../driver/utils';
import {Wait} from '../../../utils';

export class EZSPAdapterBackup {
    private driver: Driver;
    private defaultPath: string;
    private debug = Debug("zigbee-herdsman:adapter:ezsp:backup");

    public constructor(driver: Driver, path: string) {
        this.driver = driver;
        this.defaultPath = path;
    }

    public async createBackup(): Promise<Models.Backup> {
        this.debug("creating backup");
        const version: number = await this.driver.ezsp.version();
        const linkResult = await this.driver.ezsp.execCommand('getKey', {keyType: EmberKeyType.TRUST_CENTER_LINK_KEY});
        const trustCenterLinkKey: EmberKeyStruct = linkResult.keyStruct;
        const netParams = await this.driver.ezsp.execCommand('getNetworkParameters');
        const networkParams: EmberNetworkParameters = netParams.parameters;
        const netResult = await this.driver.ezsp.execCommand('getKey', {keyType: EmberKeyType.CURRENT_NETWORK_KEY});
        const networkKey: EmberKeyStruct = netResult.keyStruct;
        const ieee = (await this.driver.ezsp.execCommand('getEui64')).eui64;
        const keyCount = await this.driver.ezsp.getConfigurationValue(EzspConfigId.CONFIG_KEY_TABLE_SIZE);
        const childCount = (await this.driver.ezsp.execCommand('getParentChildParameters')).childCount;
        const children = [];
        for (let i = 0; i < childCount; i++) {
            const child = (await this.driver.ezsp.execCommand('getChildData', {index: i}));
            if (child.status == EzspStatus.SUCCESS) {
                children.push({
                    networkAddress: child.nodeId,
                    ieeeAddress: child.eui64,
                    isDirectChild: true,
                });
            }
        }
        const neighborCount = (await this.driver.ezsp.execCommand('neighborCount')).value;
        for (let i = 0; i < neighborCount; i++) {
            const neighbor = (await this.driver.ezsp.execCommand('getNeighbor', {index: i}));
            if (neighbor.status == EzspStatus.SUCCESS) {
                children.push({
                    networkAddress: neighbor.value.shortId,
                    ieeeAddress: neighbor.value.longId,
                    isDirectChild: false,
                });
            }
        }
        /* return backup structure */
        /* istanbul ignore next */
        return {
            ezsp: {
                version: version,
                linkKey: {
                    key: Buffer.from(trustCenterLinkKey.key.contents),
                    frameCounter: trustCenterLinkKey.outgoingFrameCounter,
                    sequenceNumber: trustCenterLinkKey.sequenceNumber,
                },
            },
            networkOptions: {
                panId: networkParams.panId,
                extendedPanId: Buffer.from(networkParams.extendedPanId),
                channelList: channelsMask2list(networkParams.channels),
                networkKey: Buffer.from(networkKey.key.contents),
                networkKeyDistribute: true,
            },
            logicalChannel: networkParams.radioChannel,
            networkKeyInfo: {
                sequenceNumber: networkKey.sequenceNumber,
                frameCounter: networkKey.outgoingFrameCounter,
            },
            securityLevel: 5,
            networkUpdateId: networkParams.nwkUpdateId,
            coordinatorIeeeAddress: ieee,
            devices: children
        };
    }

    /**
     * Loads currently stored backup and returns it in internal backup model.
     */
    public async getStoredBackup(): Promise<Models.Backup> {
        try {
            await fs.access(this.defaultPath);
        } catch (error) {
            return null;
        }
        let data;
        try {
            data = JSON.parse((await fs.readFile(this.defaultPath)).toString());
        } catch (error) {
            throw new Error('Coordinator backup is corrupted');
        }
        if (data.metadata?.format === "zigpy/open-coordinator-backup" && data.metadata?.version) {
            if (data.metadata?.version !== 1) {
                throw new Error(`Unsupported open coordinator backup version (version=${data.metadata?.version})`);
            }
            if (!data.metadata.internal?.ezspVersion) {
                throw new Error(`This open coordinator backup format not for EZSP adapter`);
            }
            return this.fromUnifiedBackup(data as Models.UnifiedBackupStorage);
        } else {
            throw new Error("Unknown backup format");
        }
    }
    private fromUnifiedBackup(backup: Models.UnifiedBackupStorage): Models.Backup {
        /* istanbul ignore next */
        return {
            networkOptions: {
                panId: Buffer.from(backup.pan_id, "hex").readUInt16BE(),
                extendedPanId: Buffer.from(backup.extended_pan_id, "hex"),
                channelList: backup.channel_mask,
                networkKey: Buffer.from(backup.network_key.key, "hex"),
                networkKeyDistribute: false
            },
            logicalChannel: backup.channel,
            networkKeyInfo: {
                sequenceNumber: backup.network_key.sequence_number,
                frameCounter: backup.network_key.frame_counter
            },
            coordinatorIeeeAddress: backup.coordinator_ieee ? Buffer.from(backup.coordinator_ieee, "hex") : null,
            securityLevel: backup.security_level || null,
            networkUpdateId: backup.nwk_update_id || null,
            devices: backup.devices.map(device => ({
                networkAddress: device.nwk_address ? Buffer.from(device.nwk_address, "hex").readUInt16BE() : Buffer.from("fffe", "hex").readUInt16BE(),
                ieeeAddress: Buffer.from(device.ieee_address, "hex"),
                isDirectChild: typeof device.is_child === "boolean" ? device.is_child : true,
                linkKey: !device.link_key ? undefined : {
                    key: Buffer.from(device.link_key.key, "hex"),
                    rxCounter: device.link_key.rx_counter,
                    txCounter: device.link_key.tx_counter
                }
            })),
            ezsp: {
                version: backup.metadata.internal?.ezspVersion || undefined,
                linkKey: {
                    key: Buffer.from(backup.stack_specific?.ezsp?.link_key.key || null, "hex"),
                    frameCounter: backup.stack_specific?.ezsp?.link_key.frame_counter,
                    sequenceNumber: backup.stack_specific?.ezsp?.link_key.sequence_number,
                }
            }
        };
    }

    public async restoreBackup(): Promise<void> {
        const backup = await this.getStoredBackup();
        if (!backup) return;

        const keySec = backup.networkKeyInfo.sequenceNumber;
        const hashedTclk = backup.ezsp.linkKey.key;
        let status;
        const initial_security_state: EmberInitialSecurityState = ember_security(Buffer.from(backup.networkOptions.networkKey), keySec, hashedTclk);
        status = await this.driver.ezsp.setInitialSecurityState(initial_security_state);

        status = (await this.driver.ezsp.execCommand('clearKeyTable')).status;
        console.assert(status == EmberStatus.SUCCESS,
            `Command clearKeyTable returned unexpected state: ${status}`);
        await this.driver.ezsp.execCommand('clearTransientLinkKeys');

        // _restore_keys
        await this.driver.ezsp.setConfigurationValue(EzspConfigId.CONFIG_KEY_TABLE_SIZE, 2);
        let key = new EmberKeyData()
        key.contents = backup.ezsp.linkKey.key;
        status = (await this.driver.ezsp.execCommand('addOrUpdateKeyTableEntry', 
            {address: backup.coordinatorIeeeAddress, linkKey: true, keyData: key}
        )).status;
        console.assert(status == EmberStatus.SUCCESS,
            `Command addOrUpdateKeyTableEntry returned unexpected state: ${status}`);
        
        await Wait(200);

        key = new EmberKeyData()
        key.contents = backup.networkOptions.networkKey;
        status = (await this.driver.ezsp.execCommand('addOrUpdateKeyTableEntry', 
            {address: new EmberEUI64([0, 0, 0, 0, 0, 0, 0, 0]), linkKey: false, keyData: key}
        )).status;
        console.assert(status == EmberStatus.SUCCESS,
            `Command addOrUpdateKeyTableEntry returned unexpected state: ${status}`);
        
        await this.driver.ezsp.setValue(EzspValueId.VALUE_NWK_FRAME_COUNTER, backup.networkKeyInfo.frameCounter); 
        await this.driver.ezsp.setValue(EzspValueId.VALUE_APS_FRAME_COUNTER, backup.ezsp.linkKey.frameCounter);

        const parameters: EmberNetworkParameters = new EmberNetworkParameters();
        parameters.panId = backup.networkOptions.panId;
        parameters.extendedPanId = backup.networkOptions.extendedPanId;
        parameters.radioTxPower = 5;
        parameters.radioChannel = backup.networkOptions.channelList[0];
        parameters.joinMethod = EmberJoinMethod.USE_MAC_ASSOCIATION;
        parameters.nwkManagerId = 0;
        parameters.nwkUpdateId = 0;
        parameters.channels = 0x07FFF800; // all channels

        await this.driver.ezsp.formNetwork(parameters);

        // _update_nwk_id
        const nwkId = backup.networkUpdateId;
        const frame = this.driver.makeApsFrame(EmberZDOCmd.Mgmt_NWK_Update_req, false);
        frame.options = EmberApsOption.APS_OPTION_NONE;
        frame.sequence = 0xDE;

        const params = {
            scanChannels: 0x07FFF800, // all channels
            scanDuration: 0xFF, // channelChangeReq=0xFE, channelMaskManagerAddrChangeReq=0xFF,
            nwkUpdateId: nwkId,
            nwkManagerAddr: 0x0000,
        };

        const payload = this.driver.makeZDOframe(EmberZDOCmd.Mgmt_NWK_Update_req, {transId: frame.sequence, ...params});
        const res = await this.driver.brequest(0xFFFF, frame, payload);
        if (!res) {
            throw Error('Mgmt_NWK_Update_req error');
        }
        await Wait(1000);
        await this.driver.ezsp.setValue(EzspValueId.VALUE_STACK_TOKEN_WRITING, 1);

        // restore devices
        // let i = 0;
        // backup.devices.forEach(async (device) => {
        //     const status = await this.driver.ezsp.execCommand('setChildData', {
        //         index: i++,
        //         eui64: device.ieeeAddress,
        //         nodeType: (device.isDirectChild) ? EmberNodeType.END_DEVICE : EmberNodeType.ROUTER,
        //         nodeId: device.networkAddress,
        //         phy: 0,
        //         power: 0,
        //         timeout: 0,
        //     });
        // });
    }
}