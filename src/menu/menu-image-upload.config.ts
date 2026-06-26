import { BadRequestException } from '@nestjs/common';
import { mkdirSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { nanoid } from 'nanoid';

export const MENU_IMAGE_UPLOAD_ROOT = join(process.cwd(), 'uploads');
export const MENU_IMAGE_UPLOAD_DIR = join(
  MENU_IMAGE_UPLOAD_ROOT,
  'menu-images',
);
export const MENU_IMAGE_PUBLIC_PREFIX = '/uploads/menu-images';
export const MENU_IMAGE_MAX_FILE_SIZE = 10 * 1024 * 1024;

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

mkdirSync(MENU_IMAGE_UPLOAD_ROOT, { recursive: true });
mkdirSync(MENU_IMAGE_UPLOAD_DIR, { recursive: true });

export function saveMenuImageDataUrl(dataUrl: string) {
  const match = dataUrl.match(
    /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/]+={0,2})$/i,
  );

  if (!match) {
    throw new BadRequestException(
      'Invalid image format. Only PNG, JPG, JPEG, and WEBP images are supported.',
    );
  }

  const mimeType = match[1].toLowerCase();
  const extension = MIME_EXTENSION_MAP[mimeType];
  if (!extension) {
    throw new BadRequestException(
      'Invalid image format. Only PNG, JPG, JPEG, and WEBP images are supported.',
    );
  }

  const imageBuffer = Buffer.from(match[2], 'base64');
  if (imageBuffer.length > MENU_IMAGE_MAX_FILE_SIZE) {
    throw new BadRequestException(
      'Image is too large. Please upload an image under 10MB.',
    );
  }

  mkdirSync(MENU_IMAGE_UPLOAD_DIR, { recursive: true });
  const fileName = `menu-${Date.now()}-${nanoid(12)}${extension}`;
  writeFileSync(join(MENU_IMAGE_UPLOAD_DIR, fileName), imageBuffer);

  return buildMenuImagePublicUrl(fileName);
}

export function buildMenuImagePublicUrl(fileName: string) {
  return `${MENU_IMAGE_PUBLIC_PREFIX}/${basename(fileName)}`;
}
