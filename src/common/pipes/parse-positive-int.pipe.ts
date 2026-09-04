import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/** Parses route IDs once and rejects zero, negatives, decimals, and NaN. */
@Injectable()
export class ParsePositiveIntPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    if (!/^[1-9]\d*$/.test(value)) {
      throw new BadRequestException(
        'Path parameter must be a positive integer',
      );
    }

    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new BadRequestException(
        'Path parameter is outside the supported range',
      );
    }

    return parsed;
  }
}
