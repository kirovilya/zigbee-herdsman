import EventEmitter from "events";
import {TsType} from "..";
import {logger} from "../../utils/logger";
import {ZnspUart} from "./uart";

const NS = 'zh:znsp:driv';

const MAX_INIT_ATTEMPTS = 5;

export class ZnspDriver extends EventEmitter {
    public readonly uart: ZnspUart;

    constructor(options: TsType.SerialPortOptions) {
        super();
        this.uart = new ZnspUart(options);
    }

    public async start(): Promise<boolean> {
        logger.info(`Driver starting`, NS);

        let status: boolean;

        for (let i = 0; i < MAX_INIT_ATTEMPTS; i++) {
            status = await this.uart.resetNcp();

            // fail early if we couldn't even get the port set up
            if (!status) {
                return status;
            }

            status = await this.uart.start();

            if (status) {
                logger.info(`Driver started`, NS);
                // registered after reset sequence to avoid bubbling up to adapter before this point
                // this.ash.on(AshEvents.FATAL_ERROR, this.onAshFatalError.bind(this));
                // this.tick();
                return status;
            }
        }

        return status;
    }

    public async stop(): Promise<void> {
        await this.uart.stop();

        logger.info(`Driver stopped`, NS);
    }
};