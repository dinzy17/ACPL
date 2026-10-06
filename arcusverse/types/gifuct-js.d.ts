declare module "gifuct-js" {
  export function parseGIF(arrayBuffer: ArrayBuffer | Buffer): any;
  export function decompressFrames(parsedGif: any, buildPatch: boolean): any[];
  export function decompressFrame(frame: any, gct: any, buildPatch: boolean): any;
}
