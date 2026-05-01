declare module 'qrcode' {
  interface QrCodeCreateResult {
    modules: {
      size: number;
      data: Uint8Array;
    };
  }

  interface QrCodeCreateOptions {
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    margin?: number;
    version?: number;
    maskPattern?: number;
  }

  const QRCode: {
    create(text: string, options?: QrCodeCreateOptions): QrCodeCreateResult;
  };

  export default QRCode;
}
