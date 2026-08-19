import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { ROOM_CODE_LENGTH } from '@munchkin-lan/contracts';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class RoomCodeService {
  generate(): string {
    return Array.from(
      { length: ROOM_CODE_LENGTH },
      () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)],
    ).join('');
  }
}
