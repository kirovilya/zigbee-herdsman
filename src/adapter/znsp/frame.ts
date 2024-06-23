import {crc16} from "./utils";
import { CommandId } from "./enums";
import { FRAMES } from "./commands";
import {KeyValue} from "../../controller/tstype";
import {BuffaloZcl} from "../../zspec/zcl/buffaloZcl";
import {BuffaloZclOptions} from '../../zspec/zcl/definition/tstype';
import {DataType} from "../../zspec/zcl";


function getFrameDesc(type: FrameType, key: CommandId) {
    const frameDesc = FRAMES[key];
    if (!frameDesc) throw new Error(`Unrecognized frame type from FrameID ${key}`);
    switch (type) {
        case FrameType.REQUEST:
            return frameDesc.request || [];
        case FrameType.RESPONSE:
            return frameDesc.response || [];
        case FrameType.INDICATION:
            return frameDesc.indication || [];
        default:
            return;
    }
}

export function readZnspFrame(buffer: Buffer): ZnspFrame {
    const buf = new BuffaloZcl(buffer);
    const flags = buf.readUInt16();
    const version = flags & 0x0F;
    const type = (flags >> 4) & 0x0F;
    const commandId = buf.readUInt16();
    const sequence = buf.readUInt8();
    const length = buf.readUInt16();
    // const payload = buf.readBuffer(length);
    const payload = readPayload(type, commandId, buf);

    return {
        version,
        type,
        commandId,
        sequence,
        payload,
    };
}


export function writeZnspFrame(frame: ZnspFrame): Buffer {
    const buf = new BuffaloZcl(Buffer.alloc(250));
    const flags = frame.version & 0x0F + (frame.type << 4);
    buf.writeInt16(flags);
    buf.writeUInt16(frame.commandId);
    buf.writeUInt8(frame.sequence);
    const pos = buf.getPosition();
    buf.writeUInt16(0);
    const len = writePayload(frame.type, frame.commandId, frame.payload, buf);
    buf.getBuffer().writeUInt16LE(len, pos);
    return buf.getWritten();
}

export enum FrameType {
    REQUEST = 0,
    RESPONSE = 1,
    INDICATION = 2,
}

export interface ZnspFrameData extends KeyValue {};

export interface ZnspFrame {
    version: number;
    type: FrameType;
    commandId: CommandId;
    sequence: number;
    payload?: ZnspFrameData;
}

export function makeFrame(type: FrameType, commandId: CommandId, params: KeyValue): ZnspFrame {
    const frameDesc = getFrameDesc(type, commandId);
    const payload: ZnspFrameData = {};
    for (const parameter of frameDesc) {
        const options: BuffaloZclOptions = {payload};

        if (parameter.condition && !parameter.condition(payload)) {
            continue;
        }

        payload[parameter.name] = params[parameter.name];
    }
    return {
        version: 0,
        type: type,
        commandId: commandId,
        sequence: 0,
        payload: payload,
    }
}

function readPayload(type: FrameType, commandId: CommandId, buffalo: BuffaloZcl): ZnspFrameData {
    const frameDesc = getFrameDesc(type, commandId);
    const payload: ZnspFrameData = {};

    for (const parameter of frameDesc) {
        const options: BuffaloZclOptions = {payload};

        if (parameter.condition && !parameter.condition(payload)) {
            continue;
        }

        payload[parameter.name] = buffalo.read(parameter.type as DataType, options);
    }

    return payload;
}

function writePayload(type: FrameType, commandId: CommandId, payload: ZnspFrameData, buffalo: BuffaloZcl): number {
    const frameDesc = getFrameDesc(type, commandId);
    const start = buffalo.getPosition();
    for (const parameter of frameDesc) {
        const options: BuffaloZclOptions = {};

        if (parameter.condition && !parameter.condition(payload)) {
            continue;
        }

        buffalo.write(parameter.type as DataType, payload[parameter.name], options);
    }
    return buffalo.getPosition()-start;
}
