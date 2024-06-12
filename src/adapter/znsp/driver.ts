import EventEmitter from "events";
import {TsType} from "..";
import {logger} from "../../utils/logger";
import {ZnspSlip} from "./slip";
import {ZnspFrame} from "./frame";
import {ClusterId, EUI64, NodeId, ProfileId} from '../../zspec/tstypes';

const NS = 'zh:znsp:driv';

const MAX_INIT_ATTEMPTS = 5;

export class ZnspDriver extends EventEmitter {
    public readonly port: ZnspSlip;
    public ieee: EUI64;

    constructor(options: TsType.SerialPortOptions) {
        super();
        const ieee = '0xFFFFFFFFFFFFFFFF';
        this.port = new ZnspSlip(options);
        this.port.on('frame', this.onFrame.bind(this));
    }

    public async start(): Promise<boolean> {
        logger.info(`Driver starting`, NS);

        let status: boolean;

        for (let i = 0; i < MAX_INIT_ATTEMPTS; i++) {
            status = await this.port.resetNcp();

            // fail early if we couldn't even get the port set up
            if (!status) {
                return status;
            }

            status = await this.port.start();

            if (status) {
                logger.info(`Driver started`, NS);
                return status;
            }
        }

        return status;
    }

    public async stop(): Promise<void> {
        await this.port.stop();

        logger.info(`Driver stopped`, NS);
    }

    private onFrame(frame: ZnspFrame): void {

    }
};