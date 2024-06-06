import {Transform, TransformCallback, TransformOptions} from "stream";
import {END} from "./consts";

export class SlipReader extends Transform {
    private buffer: Buffer;

    public constructor(opts?: TransformOptions) {
        super(opts);

        this.buffer = Buffer.alloc(0);
    }

    _transform(chunk: Buffer, encoding: BufferEncoding, cb: TransformCallback): void {
        let data = Buffer.concat([this.buffer, chunk]);
        let position: number;

        while ((position = data.indexOf(END)) !== -1) {
            // emit the frame via 'data' event
            const frame = data.subarray(0, position + 1);

            this.push(frame);

            // remove the frame from internal buffer (set below)
            data = data.subarray(position + 1);
        }

        this.buffer = data;

        cb();
    }

    _flush(cb: TransformCallback): void {
        this.push(this.buffer);

        this.buffer = Buffer.alloc(0);

        cb();
    }
}
