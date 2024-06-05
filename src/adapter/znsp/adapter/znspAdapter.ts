import {existsSync, readFileSync} from 'fs';
import path from 'path';
import SerialPortUtils from '../../serialPortUtils';
import SocketPortUtils from '../../socketPortUtils';
import {BackupUtils, RealpathSync, Wait} from "../../../utils";
import {Adapter, TsType} from "../..";
import {Backup, UnifiedBackupStorage} from "../../../models";
import * as Zcl from "../../../zspec/zcl";
import {
    DeviceAnnouncePayload,
    DeviceJoinedPayload,
    DeviceLeavePayload,
    Events,
    ZclPayload
} from "../../events";
import {BroadcastAddress} from '../../../zspec/enums';
import {ZnspDriver} from '../driver';

import {logger} from "../../../utils/logger";
const NS = 'zh:znsp';

export class ZNSPAdapter extends Adapter {
    private readonly driver: ZnspDriver;

    constructor(networkOptions: TsType.NetworkOptions, serialPortOptions: TsType.SerialPortOptions, backupPath: string,
        adapterOptions: TsType.AdapterOptions) {
        super(networkOptions, serialPortOptions, backupPath, adapterOptions);
        this.driver = new ZnspDriver(serialPortOptions);
    }

    public static async isValidPath(path: string): Promise<boolean> {
        return true;
    }

    public static async autoDetectPath(): Promise<string> {
        return null;
    }

    public async start(): Promise<TsType.StartResult> {
        logger.info(`ZNSP Adapter starting`, NS);

        this.driver.start();

        return 'resumed';
    }

    public async stop(): Promise<void> {
        this.driver.stop();
        
        logger.info(`ZNSP Adapter stopped`, NS);
    }

    public async getCoordinator(): Promise<TsType.Coordinator> {
        return null;
    }

    public async getCoordinatorVersion(): Promise<TsType.CoordinatorVersion> {
        return {type: `znsp`, meta: {}};
    }

    public async reset(type: "soft" | "hard"): Promise<void> {
        return Promise.reject(new Error("Not supported"));
    }

    public async supportsBackup(): Promise<boolean> {
        return true;
    }

    public async backup(ieeeAddressesInDatabase: string[]): Promise<Backup> {
        return null;
    }

    public async getNetworkParameters(): Promise<TsType.NetworkParameters> {
        return null;
    }

    public async supportsChangeChannel(): Promise<boolean> {
        return false;
    }

    public async changeChannel(newChannel: number): Promise<void> {
        return null;
    }

    public async setTransmitPower(value: number): Promise<void> {
        return null;
    }

    public async addInstallCode(ieeeAddress: string, key: Buffer): Promise<void> {
        return null;
    }

    public waitFor(networkAddress: number, endpoint: number, frameType: Zcl.FrameType, direction: Zcl.Direction, transactionSequenceNumber: number,
        clusterID: number, commandIdentifier: number, timeout: number): {promise: Promise<ZclPayload>; cancel: () => void;} {
        return null;
    }

    public async permitJoin(seconds: number, networkAddress: number): Promise<void> {
        return null;
    }

    public async lqi(networkAddress: number): Promise<TsType.LQI> {
        return null;
    }

    public async routingTable(networkAddress: number): Promise<TsType.RoutingTable> {
        return null;
    }

    public async nodeDescriptor(networkAddress: number): Promise<TsType.NodeDescriptor> {
        return null;
    }

    public async activeEndpoints(networkAddress: number): Promise<TsType.ActiveEndpoints> {
        return null;
    }

    public async simpleDescriptor(networkAddress: number, endpointID: number): Promise<TsType.SimpleDescriptor> {
        return null;
    }

    public async bind(destinationNetworkAddress: number, sourceIeeeAddress: string, sourceEndpoint: number, clusterID: number,
        destinationAddressOrGroup: string | number, type: "endpoint" | "group", destinationEndpoint?: number): Promise<void> {
        return null;
    }

    public async unbind(destinationNetworkAddress: number, sourceIeeeAddress: string, sourceEndpoint: number, clusterID: number,
        destinationAddressOrGroup: string | number, type: "endpoint" | "group", destinationEndpoint: number): Promise<void> {
        return null;
    }

    public async removeDevice(networkAddress: number, ieeeAddr: string): Promise<void> {
        return null;
    }

    public async sendZclFrameToEndpoint(ieeeAddr: string, networkAddress: number, endpoint: number, zclFrame: Zcl.Frame, timeout: number,
        disableResponse: boolean, disableRecovery: boolean, sourceEndpoint?: number): Promise<ZclPayload> {
        return null;
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
}