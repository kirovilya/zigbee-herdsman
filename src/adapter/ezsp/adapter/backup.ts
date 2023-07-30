/* istanbul ignore file */
import Debug from "debug";
import {Driver} from '../driver';
import * as Models from "../../../models";
import {EmberKeyType, EmberKeyStruct, EmberNetworkParameters} from '../driver/types';
import {channelsMask2list} from '../driver/utils';
import {fs} from "mz";
import {BackupUtils} from "../../../utils";


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
        /* return backup structure */
        /* istanbul ignore next */
        return {
            ezsp: {
                version: version,
                hashed_tclk: Buffer.from(trustCenterLinkKey.key.contents),
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
                frameCounter: networkKey.outgoingFrameCounter
            },
            securityLevel: 5,
            networkUpdateId: networkParams.nwkUpdateId,
            coordinatorIeeeAddress: ieee,
            devices: []
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
        const hashed_tclk = backup.stack_specific?.ezsp?.hashed_tclk || null;
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
                hashed_tclk: hashed_tclk ? Buffer.from(hashed_tclk, "hex") : undefined,
            }
        };
    }
}