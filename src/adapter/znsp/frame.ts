import {crc16} from "./utils";
import Buffalo from "../../buffalo/buffalo";

export class ZnspBuffalo extends Buffalo {
    public readZnspFrame(): ZnspFrame {
        const flags = this.readUInt16();
        const version = flags & 0x0F;
        const type = (flags >> 4) & 0x0F;
        const commandId = this.readUInt16();
        const sequence = this.readUInt8();
        const length = this.readUInt16();
        const payload = Buffer.from(this.readBuffer(length));

        return {
            version,
            type,
            commandId,
            sequence,
            payload,
        };
    }
}

export enum FrameType {
    REQUEST = 0,
    RESPONSE = 1,
    INDICATION = 2,
}

export type ZnspFrame = {
    version: number;
    type: FrameType;
    commandId: number;
    sequence: number;
    payload?: Buffer;
}

// export class ZnspFrame {
//     public readonly version: number;
//     public readonly type: FrameType;
//     public readonly commandId: number;
//     public readonly seq: number;
//     public readonly payload: Buffer;
//     public readonly buffer: Buffer;

//     public constructor(buffer: Buffer) {
//         this.buffer = buffer;
//         const flags = this.buffer[0] + this.buffer[1] << 8;
//         this.version = flags & 0x0F;
//         this.type = (flags >> 4) & 0x0F;
//         this.commandId = this.buffer[2] + this.buffer[3] << 8;
//         this.seq = this.buffer[4];
//         const len = this.buffer[5] + this.buffer[6] << 8;
//         this.payload = this.buffer.subarray(7, -3);
//     }

//     public static fromBuffer(buffer: Buffer): ZnspFrame {
//         return new ZnspFrame(buffer);
//     }

//     /**
//      * Throws on CRC error.
//      */
//     public checkCRC(): void {
//         const crc = crc16(this.buffer.subarray(0, -3));
//         const crcArr = Buffer.from([(crc >> 8), (crc % 256)]);
//         const subArr = this.buffer.subarray(-3, -1);

//         if (!subArr.equals(crcArr)) {
//             throw new Error(`<-- CRC error: ${this.toString()}|${subArr.toString('hex')}|${crcArr.toString('hex')}`);
//         }
//     }

//     /**
//      * 
//      * @returns Buffer to hex string
//      */
//     public toString(): string {
//         return this.buffer.toString('hex');
//     }
// }


// export class ZnspFrameData {
//     _cls_: string;
//     _id_: number;
//     _isRequest_: boolean;
//     /* eslint-disable-next-line @typescript-eslint/no-explicit-any*/
//     [name: string]: any;

//     static createFrame(
//         ezspv: number, frame_id: number, isRequest: boolean, params: ParamsDesc | Buffer
//     ): ZnspFrameData {
//         const names = FRAME_NAMES_BY_ID[frame_id];
//         if (!names) {
//             throw new Error(`Unrecognized frame FrameID ${frame_id}`);
//         }
//         let frm: EZSPFrameData;
//         names.every((frameName)=>{
//             const frameDesc = EZSPFrameData.getFrame(frameName);
//             if ((frameDesc.maxV && frameDesc.maxV < ezspv) || (frameDesc.minV && frameDesc.minV > ezspv)) {
//                 return true;
//             }
//             try {
//                 frm = new EZSPFrameData(frameName, isRequest, params);
//             } catch (error) {
//                 logger.error(`Frame ${frameName} parsing error: ${error.stack}`, NS);
//                 return true;
//             }
//             return false;
//         });
//         return frm;
//     }

//     static getFrame(name: string): EZSPFrameDesc {
//         const frameDesc = FRAMES[name];
//         if (!frameDesc) throw new Error(`Unrecognized frame from FrameID ${name}`);
//         return frameDesc;
//     }

//     constructor(key: string, isRequest: boolean, params: ParamsDesc | Buffer) {
//         this._cls_ = key;
//         this._id_ = FRAMES[this._cls_].ID;
        
//         this._isRequest_ = isRequest;
//         const frame = EZSPFrameData.getFrame(key);
//         const frameDesc = (this._isRequest_) ? frame.request || {} : frame.response || {};
//         if (Buffer.isBuffer(params)) {
//             let data = params;
//             for (const prop of Object.getOwnPropertyNames(frameDesc)) {
//                 [this[prop], data] = frameDesc[prop].deserialize(frameDesc[prop], data);
//             }
//         } else {
//             for (const prop of Object.getOwnPropertyNames(frameDesc)) {
//                 this[prop] = params[prop];
//             }
//         }
//     }

//     serialize(): Buffer {
//         const frame = EZSPFrameData.getFrame(this._cls_);
//         const frameDesc = (this._isRequest_) ? frame.request || {} : frame.response || {};
//         const result = [];
//         for (const prop of Object.getOwnPropertyNames(frameDesc)) {
//             result.push(frameDesc[prop].serialize(frameDesc[prop], this[prop]));
//         }
//         return Buffer.concat(result);
//     }

//     get name(): string {
//         return this._cls_;
//     }

//     get id(): number {
//         return this._id_;
//     }
// }

export default ZnspFrame;
