import { Module } from '@nestjs/common';
import { QrCodeService } from './qrcode.service';
import {
  PublicQrController,
  TableController,
  QrCodeController,
} from './qrcode.controller';

@Module({
  controllers: [
    PublicQrController,
    TableController,
    QrCodeController,
  ],
  providers: [QrCodeService],
  exports: [QrCodeService],
})
export class QrCodeModule {}