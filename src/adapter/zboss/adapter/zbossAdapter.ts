import {Queue, Waitress, Wait} from "../../../utils";
import {Adapter, TsType} from "../..";
import {Backup} from "../../../models";
import * as Zcl from "../../../zspec/zcl";
import {
    Coordinator,
    LQI,
    LQINeighbor,
} from '../../tstype';
import {
    Events,
    DeviceJoinedPayload,
    DeviceLeavePayload,
    ZclPayload,
} from "../../events";
import {BroadcastAddress} from '../../../zspec/enums';
import {ZBOSSDriver} from '../driver';
import {ZBOSSFrame, FrameType} from "../frame";
import {logger} from "../../../utils/logger";
import {CommandId, DeviceUpdateStatus} from "../enums";

const NS = 'zh:zboss';

interface WaitressMatcher {
    address: number | string;
    endpoint: number;
    transactionSequenceNumber?: number;
    clusterID: number;
    commandIdentifier: number;
}


export class ZBOSSAdapter extends Adapter {
    private queue: Queue;
    private readonly driver: ZBOSSDriver;
    private waitress: Waitress<ZclPayload, WaitressMatcher>;
    public coordinator: Coordinator;

    constructor(networkOptions: TsType.NetworkOptions, serialPortOptions: TsType.SerialPortOptions, backupPath: string,
        adapterOptions: TsType.AdapterOptions) {
        super(networkOptions, serialPortOptions, backupPath, adapterOptions);
        const concurrent = adapterOptions && adapterOptions.concurrent ? adapterOptions.concurrent : 8;
        logger.debug(`Adapter concurrent: ${concurrent}`, NS);
        this.queue = new Queue(concurrent);
        
        this.waitress = new Waitress<ZclPayload, WaitressMatcher>(this.waitressValidator, this.waitressTimeoutFormatter);
        this.driver = new ZBOSSDriver(serialPortOptions, networkOptions);
        this.driver.on('frame', this.processMessage.bind(this));
    }

    private async processMessage(frame: ZBOSSFrame): Promise<void> {
        logger.debug(`processMessage: ${JSON.stringify(frame)}`, NS);
        if (frame.type == FrameType.INDICATION && frame.commandId == CommandId.ZDO_DEV_UPDATE_IND && frame.payload.status == DeviceUpdateStatus.LEFT) {
            logger.debug(`Device left network request received: ${frame.payload.nwk} ${frame.payload.ieee}`, NS);
            const payload: DeviceLeavePayload = {
                networkAddress: frame.payload.nwk,
                ieeeAddr: frame.payload.ieee,
            };

            this.emit(Events.deviceLeave, payload);
        }
        if (frame.type == FrameType.INDICATION && frame.commandId == CommandId.NWK_LEAVE_IND) {
            logger.debug(`Device left network request received from ${frame.payload.ieee}`, NS);
            const payload: DeviceLeavePayload = {
                networkAddress: frame.payload.nwk,
                ieeeAddr: frame.payload.ieee,
            };

            this.emit(Events.deviceLeave, payload);
        }
        if (frame.type == FrameType.INDICATION && frame.commandId == CommandId.ZDO_DEV_ANNCE_IND) {
            logger.debug(`Device join request received: ${frame.payload.nwk} ${frame.payload.ieee}`, NS);
            const payload: DeviceJoinedPayload = {
                networkAddress: frame.payload.nwk,
                ieeeAddr: frame.payload.ieee,
            };

            this.emit(Events.deviceJoined, payload);
        }
        
        if (frame.type == FrameType.INDICATION && frame.commandId == CommandId.APSDE_DATA_IND) {         
            logger.debug(`ZCL frame received from ${frame.payload.srcNwk} ${frame.payload.srcEndpoint}`, NS);
            const payload: ZclPayload = {
                clusterID: frame.payload.clusterID,
                header: Zcl.Header.fromBuffer(frame.payload.data),
                data: frame.payload.data,
                address: frame.payload.srcNwk,
                endpoint: frame.payload.srcEndpoint,
                linkquality: frame.payload.lqi,
                groupID: frame.payload.grpNwk,
                wasBroadcast: false, // TODO
                destinationEndpoint: frame.payload.dstEndpoint,
            };

            this.waitress.resolve(payload);
            this.emit(Events.zclPayload, payload);
        }
        this.emit('event', frame);
    }


    public static async isValidPath(path: string): Promise<boolean> {
        return true;
    }

    public static async autoDetectPath(): Promise<string> {
        return null;
    }

    public async start(): Promise<TsType.StartResult> {
        logger.info(`ZBOSS Adapter starting`, NS);

        await this.driver.connect();

        return await this.driver.startup();
    }

    public async stop(): Promise<void> {
        this.driver.stop();
        
        logger.info(`ZBOSS Adapter stopped`, NS);
    }

    public async getCoordinator(): Promise<Coordinator> {
        return this.queue.execute<Coordinator>(async () => {
            const info = await this.driver.getCoordinator();
            logger.debug(`ZBOSS Adapter Coordinator description:\n${JSON.stringify(info)}`, NS);
            this.coordinator = {
                networkAddress: info.networkAddress,
                manufacturerID: 0,
                ieeeAddr: info.ieeeAddr,
                endpoints: info.endpoints,
            };

            return this.coordinator;
        });
    }

    public async getCoordinatorVersion(): Promise<TsType.CoordinatorVersion> {
        return this.driver.getCoordinatorVersion();
    }

    public async reset(type: "soft" | "hard"): Promise<void> {
        return Promise.reject(new Error("Not supported"));
    }

    public async supportsBackup(): Promise<boolean> {
        return false;
    }

    public async backup(ieeeAddressesInDatabase: string[]): Promise<Backup> {
        return null;
    }

    public async getNetworkParameters(): Promise<TsType.NetworkParameters> {
        return this.queue.execute<TsType.NetworkParameters>(async () => {
            const channel = this.driver.netInfo.network.channel;
            const panID = this.driver.netInfo.network.panID;
            const extendedPanID = this.driver.netInfo.network.extendedPanID;

            return {
                panID,
                extendedPanID: parseInt(Buffer.from(extendedPanID).toString('hex'), 16),
                channel,
            };
        });
    }

    public async supportsChangeChannel(): Promise<boolean> {
        return false;
    }

    public async changeChannel(newChannel: number): Promise<void> {
        return null;
    }

    public async setTransmitPower(value: number): Promise<void> {
        if (this.driver.isInitialized()) {
            return this.queue.execute<void>(async () => {
                await this.driver.setTXPower(value);
            });
        }
    }

    public async addInstallCode(ieeeAddress: string, key: Buffer): Promise<void> {
        return null;
    }

    public async permitJoin(seconds: number, networkAddress: number): Promise<void> {
        if (this.driver.isInitialized()) {
            return this.queue.execute<void>(async () => {
                await this.driver.permitJoin(networkAddress, seconds);
                if (!networkAddress) {
                    // send broadcast permit
                    await this.driver.permitJoin(0xFFFC, seconds);
                }
            });
        }
    }

    public async lqi(networkAddress: number): Promise<TsType.LQI> {
        return this.queue.execute<LQI>(async (): Promise<LQI> => {
            const neighbors: LQINeighbor[] = [];

            const request = async (startIndex: number): Promise<ZBOSSFrame> => {
                try {
                    const result = await this.driver.lqi(networkAddress, startIndex);

                    return result;
                } catch(error) {
                    throw new Error(`LQI for '${networkAddress}' failed: ${error}`);
                }
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const add = (list: any): void => {
                for (const entry of list) {
                    neighbors.push({
                        linkquality: entry.lqi,
                        networkAddress: entry.nodeid,
                        ieeeAddr: `0x${(entry.ieee).toString()}`,
                        relationship: (entry.packed >> 4) & 0x7,
                        depth: entry.depth,
                    });
                }
            };

            let response = (await request(0)).payload;
            add(response.neighborlqilist.neighbors);
            const size = response.neighborlqilist.entries;
            let nextStartIndex = response.neighborlqilist.neighbors.length;

            while (neighbors.length < size) {
                response = await request(nextStartIndex);
                add(response.neighborlqilist.neighbors);
                nextStartIndex += response.neighborlqilist.neighbors.length;
            }

            return {neighbors};
        }, networkAddress);
    }

    public async routingTable(networkAddress: number): Promise<TsType.RoutingTable> {
        return null;
    }

    public async nodeDescriptor(networkAddress: number): Promise<TsType.NodeDescriptor> {
        return this.queue.execute<TsType.NodeDescriptor>(async () => {
            try {
                logger.debug(`Requesting 'Node Descriptor' for '${networkAddress}'`, NS);
                const descriptor = await this.driver.nodeDescriptor(networkAddress);
                const logicaltype = descriptor.payload.flags & 0x07;
                return {
                    manufacturerCode: descriptor.payload.manufacturerCode,
                    type: logicaltype == 0 ? 'Coordinator' : logicaltype == 1 ? 'Router' : 'EndDevice',
                };
            } catch (error) {
                logger.debug(`Node descriptor request for '${networkAddress}' failed (${error}), retry`, NS);
                throw error;
            }
        });
    }

    public async activeEndpoints(networkAddress: number): Promise<TsType.ActiveEndpoints> {
        logger.debug(`Requesting 'Active endpoints' for '${networkAddress}'`, NS);
        return this.queue.execute<TsType.ActiveEndpoints>(async () => {
            const endpoints = await this.driver.activeEndpoints(networkAddress);
            return {endpoints: [...endpoints.payload.endpoints]};
        }, networkAddress);
    }

    public async simpleDescriptor(networkAddress: number, endpointID: number): Promise<TsType.SimpleDescriptor> {
        logger.debug(`Requesting 'Simple Descriptor' for '${networkAddress}' endpoint ${endpointID}`, NS);
        return this.queue.execute<TsType.SimpleDescriptor>(async () => {
            const sd = await this.driver.simpleDescriptor(networkAddress, endpointID);
            return {
                profileID: sd.payload.profileID,
                endpointID: sd.payload.endpoint,
                deviceID: sd.payload.deviceID,
                inputClusters: sd.payload.inputClusters,
                outputClusters: sd.payload.outputClusters,
            };
        }, networkAddress);
    }

    public async bind(destinationNetworkAddress: number, sourceIeeeAddress: string, sourceEndpoint: number, clusterID: number,
        destinationAddressOrGroup: string | number, type: "endpoint" | "group", destinationEndpoint?: number): Promise<void> {
        return this.queue.execute<void>(async () => {
            await this.driver.bind(destinationNetworkAddress, sourceIeeeAddress, sourceEndpoint, clusterID, destinationAddressOrGroup, type, destinationEndpoint);
        }, destinationNetworkAddress);
    }

    public async unbind(destinationNetworkAddress: number, sourceIeeeAddress: string, sourceEndpoint: number, clusterID: number,
        destinationAddressOrGroup: string | number, type: "endpoint" | "group", destinationEndpoint: number): Promise<void> {
        return this.queue.execute<void>(async () => {
            await this.driver.unbind(destinationNetworkAddress, sourceIeeeAddress, sourceEndpoint, clusterID, destinationAddressOrGroup, type, destinationEndpoint);
        }, destinationNetworkAddress);
    }

    public async removeDevice(networkAddress: number, ieeeAddr: string): Promise<void> {
        return this.queue.execute<void>(async () => {
            await this.driver.removeDevice(networkAddress, ieeeAddr);
        }, networkAddress);
    }

    public async sendZclFrameToEndpoint(ieeeAddr: string, networkAddress: number, endpoint: number, zclFrame: Zcl.Frame, timeout: number,
        disableResponse: boolean, disableRecovery: boolean, sourceEndpoint?: number): Promise<ZclPayload> {
        return this.queue.execute<ZclPayload>(async () => {
            return this.sendZclFrameToEndpointInternal(
                ieeeAddr,
                networkAddress,
                endpoint,
                sourceEndpoint || 1,
                zclFrame,
                timeout,
                disableResponse,
                disableRecovery,
                0,
                0,
                false,
                false,
                false,
                null,
            );
        }, networkAddress);
    }

    private async sendZclFrameToEndpointInternal(
        ieeeAddr: string,
        networkAddress: number,
        endpoint: number,
        sourceEndpoint: number,
        zclFrame: Zcl.Frame,
        timeout: number,
        disableResponse: boolean,
        disableRecovery: boolean,
        responseAttempt: number,
        dataRequestAttempt: number,
        checkedNetworkAddress: boolean,
        discoveredRoute: boolean,
        assocRemove: boolean,
        assocRestore: {ieeeadr: string; nwkaddr: number; noderelation: number},
    ): Promise<ZclPayload> {
        if (ieeeAddr == null) {
            ieeeAddr = this.coordinator.ieeeAddr;
        }
        logger.debug(
            `sendZclFrameToEndpointInternal ${ieeeAddr}:${networkAddress}/${endpoint} ` +
                `(${responseAttempt},${dataRequestAttempt},${this.queue.count()}), timeout=${timeout}`,
            NS,
        );
        let response = null;
        const command = zclFrame.command;
        if (command.hasOwnProperty('response') && disableResponse === false) {
            response = this.waitFor(
                networkAddress,
                endpoint,
                zclFrame.header.transactionSequenceNumber,
                zclFrame.cluster.ID,
                command.response,
                timeout,
            );
        } else if (!zclFrame.header.frameControl.disableDefaultResponse) {
            response = this.waitFor(
                networkAddress,
                endpoint,
                zclFrame.header.transactionSequenceNumber,
                zclFrame.cluster.ID,
                Zcl.Foundation.defaultRsp.ID,
                timeout,
            );
        }

        const dataConfirmResult = await this.driver.request(
            ieeeAddr, 0x0104, zclFrame.cluster.ID, endpoint, sourceEndpoint || 0x01,
            zclFrame.toBuffer(),
        );
        if (!dataConfirmResult) {
            if (response != null) {
                response.cancel();
            }
            throw Error('sendZclFrameToEndpointInternal error');
        }
        if (response !== null) {
            try {
                const result = await response.start().promise;
                return result;
            } catch (error) {
                logger.debug(`Response timeout (${ieeeAddr}:${networkAddress},${responseAttempt})`, NS);
                if (responseAttempt < 1 && !disableRecovery) {
                    return this.sendZclFrameToEndpointInternal(
                        ieeeAddr,
                        networkAddress,
                        endpoint,
                        sourceEndpoint,
                        zclFrame,
                        timeout,
                        disableResponse,
                        disableRecovery,
                        responseAttempt + 1,
                        dataRequestAttempt,
                        checkedNetworkAddress,
                        discoveredRoute,
                        assocRemove,
                        assocRestore,
                    );
                } else {
                    throw error;
                }
            }
        } else {
            return null;
        }
    }

    public async sendZclFrameToGroup(groupID: number, zclFrame: Zcl.Frame, sourceEndpoint?: number): Promise<void> {
        return null;
    }

    public async sendZclFrameToAll(endpoint: number, zclFrame: Zcl.Frame, sourceEndpoint: number, destination: BroadcastAddress): Promise<void> {
        return null;
    }

    public async setChannelInterPAN(channel: number): Promise<void> {
        return null;
    }

    public async sendZclFrameInterPANToIeeeAddr(zclFrame: Zcl.Frame, ieeeAddress: string): Promise<void> {
        return null;
    }

    public async sendZclFrameInterPANBroadcast(zclFrame: Zcl.Frame, timeout: number): Promise<ZclPayload> {
        return null;
    }

    public async restoreChannelInterPAN(): Promise<void> {
        return null;
    }

    
    public waitFor(
        networkAddress: number,
        endpoint: number,
        // frameType: Zcl.FrameType,
        // direction: Zcl.Direction,
        transactionSequenceNumber: number,
        clusterID: number,
        commandIdentifier: number,
        timeout: number,
    ): {promise: Promise<ZclPayload>; cancel: () => void, start: () => {promise: Promise<ZclPayload>}; } {
        const payload = {
            address: networkAddress,
            endpoint,
            clusterID,
            commandIdentifier,
            transactionSequenceNumber,
        };

        const waiter = this.waitress.waitFor(payload, timeout);
        const cancel = (): void => this.waitress.remove(waiter.ID);

        return {cancel: cancel, promise: waiter.start().promise, start: waiter.start};
    }

    private waitressTimeoutFormatter(matcher: WaitressMatcher, timeout: number): string {
        return (
            `Timeout - ${matcher.address} - ${matcher.endpoint}` +
            ` - ${matcher.transactionSequenceNumber} - ${matcher.clusterID}` +
            ` - ${matcher.commandIdentifier} after ${timeout}ms`
        );
    }

    private waitressValidator(payload: ZclPayload, matcher: WaitressMatcher): boolean {
        return (
            payload.header &&
            (!matcher.address || payload.address === matcher.address) &&
            payload.endpoint === matcher.endpoint &&
            (!matcher.transactionSequenceNumber || payload.header.transactionSequenceNumber === matcher.transactionSequenceNumber) &&
            payload.clusterID === matcher.clusterID &&
            matcher.commandIdentifier === payload.header.commandIdentifier
        );
    }
}