import { Module } from '@nestjs/common';
import { QrCodeService } from './qrcode.service';
import { MenuModule } from '../menu/menu.module';
import {
  PublicQrController,
  TableController,
  GenerateQrCodeController,
  QrCodeController,
} from './qrcode.controller';

@Module({
  imports: [MenuModule],
  controllers: [
    PublicQrController,
    TableController,
    GenerateQrCodeController,
    QrCodeController,
  ],
  providers: [QrCodeService],
  exports: [QrCodeService],
})
export class QrCodeModule {
  constructor() {
    console.log('QR module loaded');
  }
}
