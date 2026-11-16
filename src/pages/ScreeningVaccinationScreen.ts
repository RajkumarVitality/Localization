import { browser } from '@wdio/globals';
import { deflateSync } from 'node:zlib';
import { MobileSession } from '../utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { BaseScreen } from './BaseScreen.js';
import { formatMobileLocator, mobileElements } from './mobileElements.js';

function pngChunk(type: string, data: Buffer): Buffer {
  const typeData = Buffer.from(type, 'ascii');
  const chunkData = Buffer.concat([typeData, data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(chunkData));
  return Buffer.concat([length, chunkData, checksum]);
}

function crc32(data: Buffer): number {
  let checksum = 0xffffffff;
  for (const byte of data) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
    }
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

function createProofPngBase64(): string {
  const width = 320;
  const height = 240;
  const stride = width * 4 + 1;
  const pixels = Buffer.alloc(stride * height);

  for (let row = 0; row < height; row++) {
    const rowOffset = row * stride;
    pixels[rowOffset] = 0;
    for (let column = 0; column < width; column++) {
      const border = row < 8 || row >= height - 8 || column < 8 || column >= width - 8;
      const header = row >= 32 && row < 72;
      const pixelOffset = rowOffset + 1 + column * 4;
      pixels[pixelOffset] = border || header ? 48 : 245;
      pixels[pixelOffset + 1] = border || header ? 112 : 248;
      pixels[pixelOffset + 2] = border || header ? 86 : 245;
      pixels[pixelOffset + 3] = 255;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0))
  ]).toString('base64');
}

export class ScreeningVaccinationScreen extends BaseScreen {
  constructor(session: MobileSession) {
    super(session);
  }

  async assertFormLoaded(): Promise<void> {
    await this.assertCondition(() => this.isVisible(mobileElements.ScreeningVaccinationScreen.formType.android, mobileElements.ScreeningVaccinationScreen.formType.ios), 'Screening vaccination form type field was not displayed');
    await this.assertCondition(() => this.isVisible(mobileElements.ScreeningVaccinationScreen.formDate.android, mobileElements.ScreeningVaccinationScreen.formDate.ios), 'Screening vaccination form date field was not displayed');
    await this.assertCondition(() => this.isVisible(mobileElements.ScreeningVaccinationScreen.uploadControl.android, mobileElements.ScreeningVaccinationScreen.uploadControl.ios), 'Screening vaccination form upload control was not displayed');
  }

  openSubmissionForm(): Promise<void> {
    return this.click(mobileElements.ScreeningVaccinationScreen.openSubmissionForm.android, mobileElements.ScreeningVaccinationScreen.openSubmissionForm.ios);
  }

  async acceptDataPrivacyNotice(): Promise<void> {
    if (await this.isVisible(mobileElements.ScreeningVaccinationScreen.understandPrivacy.android, mobileElements.ScreeningVaccinationScreen.understandPrivacy.ios)) {
      await this.click(mobileElements.ScreeningVaccinationScreen.understandPrivacy.android, mobileElements.ScreeningVaccinationScreen.understandPrivacy.ios);
    }
  }

  async assertProofUploadControlVisible(): Promise<void> {
    await this.assertCondition(
      () => this.isVisible(mobileElements.ScreeningVaccinationScreen.proofUploadControl.android, mobileElements.ScreeningVaccinationScreen.proofUploadControl.ios),
      'Proof upload control was not visible on the screening vaccination form'
    );
  }

  async selectFluType(): Promise<void> {
    await this.click(mobileElements.ScreeningVaccinationScreen.formType.android, mobileElements.ScreeningVaccinationScreen.formType.ios);
    await this.click(mobileElements.ScreeningVaccinationScreen.fluOption.android, mobileElements.ScreeningVaccinationScreen.fluOption.ios);
  }

  async selectCurrentDate(): Promise<void> {
    await this.click(mobileElements.ScreeningVaccinationScreen.datePickerOpen.android, mobileElements.ScreeningVaccinationScreen.datePickerOpen.ios);

    const today = String(new Date().getDate());
    const dayLocator = formatMobileLocator(mobileElements.ScreeningVaccinationScreen.currentDay, { day: today });
    await this.assertCondition(() => this.isVisible(dayLocator.android, dayLocator.ios), 'Current day was not available in the date picker');
    await this.click(dayLocator.android, dayLocator.ios);

    if (await this.isVisible(mobileElements.ScreeningVaccinationScreen.dateConfirm.android, mobileElements.ScreeningVaccinationScreen.dateConfirm.ios)) {
      await this.click(mobileElements.ScreeningVaccinationScreen.dateConfirm.android, mobileElements.ScreeningVaccinationScreen.dateConfirm.ios);
    } else if (this.session.isIOS) {
      await this.click(mobileElements.ScreeningVaccinationScreen.datePickerScrim.android, mobileElements.ScreeningVaccinationScreen.datePickerScrim.ios);
    }
  }

  async uploadPdfFromDevice(): Promise<void> {
    await this.scrollAndClick(mobileElements.ScreeningVaccinationScreen.uploadButton.android, mobileElements.ScreeningVaccinationScreen.uploadButton.ios, 5);
    await this.click(mobileElements.ScreeningVaccinationScreen.selectPdf.android, mobileElements.ScreeningVaccinationScreen.selectPdf.ios);
    await this.click(mobileElements.ScreeningVaccinationScreen.pdfFile.android, mobileElements.ScreeningVaccinationScreen.pdfFile.ios);
  }

  private async uploadImageFromGallery(): Promise<void> {
    await this.scrollAndClick(mobileElements.ScreeningVaccinationScreen.uploadButton.android, mobileElements.ScreeningVaccinationScreen.uploadButton.ios, 5);
    await this.assertCondition(() => this.isVisible(mobileElements.ScreeningVaccinationScreen.galleryOption.android, mobileElements.ScreeningVaccinationScreen.galleryOption.ios), 'The iOS upload options did not expose a gallery choice');
    await this.click(mobileElements.ScreeningVaccinationScreen.galleryOption.android, mobileElements.ScreeningVaccinationScreen.galleryOption.ios);
    await this.assertCondition(() => this.isVisible(mobileElements.ScreeningVaccinationScreen.firstGalleryImage.android, mobileElements.ScreeningVaccinationScreen.firstGalleryImage.ios), 'No selectable photos were visible in the iOS gallery');
    await this.click(mobileElements.ScreeningVaccinationScreen.firstGalleryImage.android, mobileElements.ScreeningVaccinationScreen.firstGalleryImage.ios);
  }

  async uploadPngFromDevice(): Promise<void> {
    if (this.session.isIOS) {
      await this.uploadImageFromGallery();
      return;
    }

    await browser.pushFile('/sdcard/Download/screening-proof.png', createProofPngBase64());
    await this.scrollAndClick(mobileElements.ScreeningVaccinationScreen.uploadButton.android, mobileElements.ScreeningVaccinationScreen.uploadButton.ios, 5);
    await this.click(mobileElements.ScreeningVaccinationScreen.selectPdf.android, mobileElements.ScreeningVaccinationScreen.selectPdf.ios);
    await this.click(mobileElements.ScreeningVaccinationScreen.showRoots.android, mobileElements.ScreeningVaccinationScreen.showRoots.ios);
    await this.click(mobileElements.ScreeningVaccinationScreen.downloads.android, mobileElements.ScreeningVaccinationScreen.downloads.ios);
    await this.click(mobileElements.ScreeningVaccinationScreen.proofPng.android, mobileElements.ScreeningVaccinationScreen.proofPng.ios);
  }

  submitForm(): Promise<void> {
    return this.scrollAndClick(mobileElements.ScreeningVaccinationScreen.submitButton.android, mobileElements.ScreeningVaccinationScreen.submitButton.ios, 8);
  }

  async assertSubmissionSuccessful(): Promise<void> {
    await this.assertCondition(
      () => this.isVisible(mobileElements.ScreeningVaccinationScreen.submissionSuccess.android, mobileElements.ScreeningVaccinationScreen.submissionSuccess.ios),
      'Proof submission success message was not displayed'
    );
  }

  async assertSubmissionBlockedWithoutProof(): Promise<void> {
    await this.assertCondition(
      async () => !await this.isVisible(mobileElements.ScreeningVaccinationScreen.submissionSuccess.android, mobileElements.ScreeningVaccinationScreen.submissionSuccess.ios),
      'Proof submission must not succeed without an uploaded proof'
    );
    await this.assertFormLoaded();
  }

  tapDone(): Promise<void> {
    return this.click(mobileElements.ScreeningVaccinationScreen.doneButton.android, mobileElements.ScreeningVaccinationScreen.doneButton.ios);
  }
}
