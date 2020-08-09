/* eslint-disable camelcase, no-unused-vars */

import { length, repeat, clone } from '../node_modules/ramda/src/index.mjs'
import {
  BINARY_COMPRESSION,
  ASCII_COMPRESSION,
  CMP_NO_ERROR,
  CMP_INVALID_DICTSIZE,
  CMP_INVALID_MODE,
  CMP_BAD_DATA,
  CMP_ABORT,
  PKDCL_OK,
  PKDCL_STREAM_END,
  DistCode,
  DistBits,
  LenBits,
  LenCode,
  ExLenBits,
  LenBase,
  ChBitsAsc,
  ChCodeAsc
} from './common.mjs'

import {
  getValueFromPointer,
  copyPointer,
  getAddressOfValue,
  makePointerFrom,
  setValueToPointer,
  toByteArray
} from './_helpers.mjs'

const GenDecodeTabs = (originalPositions, start_indexes, length_bits) => {
  const positions = clone(originalPositions)
  const elements = length(length_bits)

  for (let i = 0; i < elements; i++) {
    const size = 1 << length_bits[i]

    for (let index = start_indexes[i]; index < 0x100; index += size) {
      positions[index] = i
    }
  }

  return positions
}

const GenAscTabs = pWork => {
  const pChCodeAsc = copyPointer(ChCodeAsc[0xff]) // pointer

  for (let count = 0x00ff; count >= 0; count--) {
    const pChBitsAsc = makePointerFrom(pWork.ChBitsAsc, count) // pointer
    let bits_asc = getValueFromPointer(pChBitsAsc)

    let acc
    let add

    if (bits_asc <= 8) {
      add = 1 << bits_asc
      acc = getValueFromPointer(pChCodeAsc)

      do {
        pWork.offs2C34[acc] = count
        acc += add
      } while (acc < 0x100)
    } else if ((acc = getValueFromPointer(pChCodeAsc) & 0xff) !== 0) {
      pWork.offs2C34[acc] = 0xff

      if (getValueFromPointer(pChCodeAsc) & 0x3f) {
        bits_asc -= 4
        setValueToPointer(pChBitsAsc, bits_asc)
        add = 1 << bits_asc

        acc = getValueFromPointer(pChCodeAsc) >> 4
        do {
          pWork.offs2D34[acc] = count
          acc += add
        } while (acc < 0x100)
      } else {
        bits_asc -= 6
        setValueToPointer(pChBitsAsc, bits_asc)
        add = 1 << bits_asc

        acc = getValueFromPointer(pChCodeAsc) >> 6
        do {
          pWork.offs2E34[acc] = count
          acc += add
        } while (acc < 0x80)
      }
    } else {
      bits_asc -= 8
      setValueToPointer(pChBitsAsc, bits_asc)
      add = 1 << bits_asc

      acc = getValueFromPointer(pChCodeAsc) >> 8

      do {
        pWork.offs2EB4[acc] = count
        acc += add
      } while (acc < 0x100)
    }
  }
}

const WasteBits = (pWork, nBits) => {
  if (nBits <= pWork.extra_bits) {
    pWork.extra_bits -= nBits
    pWork.bit_buff >>= nBits
    return PKDCL_OK
  }

  pWork.bit_buff >>= pWork.extra_bits
  if (pWork.in_pos === pWork.in_bytes) {
    pWork.in_pos = length(pWork.in_buff)
    if ((pWork.in_bytes = pWork.read_buf(getValueFromPointer(pWork.in_buff), copyPointer(pWork.in_pos))) === 0) {
      return PKDCL_STREAM_END
    }
    pWork.in_pos = 0
  }

  pWork.bit_buff |= pWork.in_buff[pWork.in_pos++] << 8
  pWork.bit_buff >>= nBits - pWork.extra_bits
  pWork.extra_bits = pWork.extra_bits - nBits + 8
  return PKDCL_OK
}

const DecodeLit = pWork => {
  let extra_length_bits
  let length_code
  let value

  if (pWork.bit_buff & 1) {
    if (WasteBits(pWork, 1)) {
      return 0x306
    }

    length_code = pWork.LengthCodes[pWork.bit_buff & 0xff]

    if (WasteBits(pWork, pWork.LenBits[length_code])) {
      return 0x306
    }

    if ((extra_length_bits = pWork.ExLenBits[length_code]) !== 0) {
      const extra_length = pWork.bit_buff & ((1 << extra_length_bits) - 1)

      if (WasteBits(pWork, extra_length_bits)) {
        if (length_code + extra_length !== 0x10e) {
          return 0x306
        }
      }
      length_code = pWork.LenBase[length_code] + extra_length
    }
    return length_code + 0x100
  }

  if (WasteBits(pWork, 1)) {
    return 0x306
  }

  if (pWork.ctype === BINARY_COMPRESSION) {
    const uncompressed_byte = pWork.bit_buff & 0xff

    if (WasteBits(pWork, 8)) {
      return 0x306
    }
    return uncompressed_byte
  }

  if (pWork.bit_buff & 0xff) {
    value = pWork.offs2C34[pWork.bit_buff & 0xff]

    if (value === 0xff) {
      if (pWork.bit_buff & 0x3f) {
        if (WasteBits(pWork, 4)) {
          return 0x306
        }

        value = pWork.offs2D34[pWork.bit_buff & 0xff]
      } else {
        if (WasteBits(pWork, 6)) {
          return 0x306
        }

        value = pWork.offs2E34[pWork.bit_buff & 0x7f]
      }
    }
  } else {
    if (WasteBits(pWork, 8)) {
      return 0x306
    }

    value = pWork.offs2EB4[pWork.bit_buff & 0xff]
  }

  return WasteBits(pWork, pWork.ChBitsAsc[value]) ? 0x306 : value
}

const DecodeDist = (pWork, rep_length) => {
  let distance

  const dist_pos_code = pWork.DistPosCodes[pWork.bit_buff & 0xff]
  const dist_pos_bits = pWork.DistBits[dist_pos_code]

  if (WasteBits(pWork, dist_pos_bits)) {
    return 0
  }

  if (rep_length === 2) {
    distance = (dist_pos_code << 2) | (pWork.bit_buff & 0x03)
    if (WasteBits(pWork, 2)) {
      return 0
    }
  } else {
    distance = (dist_pos_code << pWork.dsize_bits) | (pWork.bit_buff & pWork.dsize_mask)
    if (WasteBits(pWork, pWork.dsize_bits)) {
      return 0
    }
  }

  return distance + 1
}

const Expand = pWork => {
  let result
  let next_literal
  let copyBytes

  pWork.outputPos = 0x1000

  // ----------------------

  while ((result = next_literal = DecodeLit(pWork)) < 0x305) {
    if (next_literal >= 0x100) {
      let rep_length
      let minus_dist

      rep_length = next_literal - 0xfe

      if ((minus_dist = DecodeDist(pWork, rep_length)) === 0) {
        result = 0x306
        break
      }

      const target = copyPointer(pWork.out_buff[pWork.outputPos]) // pointer!
      const source = makePointerFrom(target, -minus_dist) // pointer!

      // Update buffer output position
      pWork.outputPos += rep_length

      // Copy the repeating sequence
      let cntr = 1
      while (rep_length-- > 0) {
        setValueToPointer(makePointerFrom(target, cntr), getValueFromPointer(makePointerFrom(source, cntr)))
        cntr++
      }
    } else {
      pWork.out_buff[pWork.outputPos++] = next_literal
    }

    // Flush the output buffer, if number of extracted bytes has reached the end
    if (pWork.outputPos >= 0x2000) {
      copyBytes = 0x1000
      pWork.write_buf(toByteArray(pWork.out_buff[0x1000]), copyPointer(copyBytes), pWork.param)

      // watch out, copyWithin() is mutating out_buff!
      pWork.out_buff.copyWithin(0, 0x1000, pWork.outputPos)
      pWork.outputPos -= 0x1000
    }
  }

  copyBytes = pWork.outputPos - 0x1000
  pWork.write_buf(toByteArray(pWork.out_buff[0x1000]), copyPointer(copyBytes), pWork.param)

  // ----------------------

  return result
}

const explode = (read_buf, write_buf) => {
  const pWork = {
    ctype: 0,
    outputPos: 0,
    dsize_bits: 0,
    dsize_mask: 0,
    bit_buff: 0,
    extra_bits: 0,
    in_pos: 0x800,
    in_bytes: 0,
    read_buf: copyPointer(read_buf),
    write_buf: copyPointer(write_buf),
    out_buff: repeat(0, 0x2204),
    in_buff: repeat(0, 0x800),
    DistPosCodes: repeat(0, 0x100),
    LengthCodes: repeat(0, 0x100),
    offs2C34: repeat(0, 0x100),
    offs2D34: repeat(0, 0x100),
    offs2E34: repeat(0, 0x80),
    offs2EB4: repeat(0, 0x100),
    ChBitsAsc: repeat(0, 0x100),
    DistBits: repeat(0, 0x40),
    LenBits: repeat(0, 0x10),
    ExLenBits: repeat(0, 0x10),
    LenBase: repeat(0, 0x10)
  }

  // read_buf reads data to in_buff and returns the amount of bytes, that have been read
  // read_buf will override 2nd parameter (amount of bytes to read) if there is less to be read
  pWork.in_bytes = pWork.read_buf(pWork.in_buff, getAddressOfValue(pWork.in_pos))

  if (pWork.in_bytes <= 4) {
    // file is less, than 4 bytes long, which is invalid
    return CMP_BAD_DATA
  }

  pWork.ctype = pWork.in_buff[0] // Get the compression type (BINARY or ASCII)
  pWork.dsize_bits = pWork.in_buff[1] // Get the dictionary size
  pWork.bit_buff = pWork.in_buff[2] // Initialize 16-bit bit buffer
  pWork.in_pos = 3 // Position in input buffer

  if (pWork.dsize_bits < 4 || pWork.dsize_bits > 6) {
    return CMP_INVALID_DICTSIZE
  }

  pWork.dsize_mask = 0xffff >> (0x10 - pWork.dsize_bits)

  if (pWork.ctype !== BINARY_COMPRESSION) {
    if (pWork.ctype !== ASCII_COMPRESSION) {
      return CMP_INVALID_MODE
    }

    pWork.ChBitsAsc = clone(ChBitsAsc)
    GenAscTabs(pWork)
  }

  pWork.LenBits = clone(LenBits)
  pWork.LengthCodes = GenDecodeTabs(pWork.LengthCodes, LenCode, pWork.LenBits)
  pWork.ExLenBits = clone(ExLenBits)
  pWork.LenBase = clone(LenBase)
  pWork.DistBits = clone(DistBits)
  pWork.DistPosCodes = GenDecodeTabs(pWork.DistPosCodes, DistCode, pWork.DistBits)

  if (Expand(pWork) !== 0x306) {
    return CMP_NO_ERROR
  }

  return CMP_ABORT
}

/* eslint-enable */

export default explode