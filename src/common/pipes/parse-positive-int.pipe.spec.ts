import { BadRequestException } from '@nestjs/common';
import { ParsePositiveIntPipe } from './parse-positive-int.pipe';

describe('ParsePositiveIntPipe', () => {
  const pipe = new ParsePositiveIntPipe();

  it('parses a positive integer path parameter', () => {
    expect(pipe.transform('42')).toBe(42);
  });

  it.each(['0', '-1', '1.5', 'wallet', '9007199254740992'])(
    'rejects %s',
    (value) => {
      expect(() => pipe.transform(value)).toThrow(BadRequestException);
    },
  );
});
