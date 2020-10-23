/* global describe, it */

import assert from 'assert'
import fs from 'fs'
import explode, { parseFirstChunk, generateAsciiTables, generateDecodeTables } from '../src/explode.mjs'
import { ERROR_INVALID_DATA, ERROR_INVALID_DICTIONARY_SIZE } from '../src/constants.mjs'
import { through } from '../src/helpers.mjs'
import { readToBuffer, buffersShouldEqual } from './helpers.mjs'

const decompressToBuffer = (fileName, chunkSizeInBytes = 1024) => {
  return new Promise((resolve, reject) => {
    const chunks = []
    fs.createReadStream(fileName, { highWaterMark: chunkSizeInBytes })
      .pipe(
        through(explode())
          .on('error', reject)
          .on('data', chunk => {
            chunks.push(chunk)
          })
          .on('finish', function () {
            resolve(Buffer.concat(chunks))
          })
      )
      .on('error', reject)
  })
}

describe('parseFirstChunk', () => {
  it('is a function', () => {
    assert.strictEqual(typeof parseFirstChunk, 'function')
  })

  it('rejects with ERROR_INVALID_DATA, when given buffer is shorter, than 5', async () => {
    await assert.rejects(parseFirstChunk(Buffer.from([0, 0, 0, 0])), new Error(ERROR_INVALID_DATA))
  })

  it('rejects with ERROR_INVALID_DICTIONARY_SIZE, when 2nd byte is not between 4 and 6', async () => {
    await assert.rejects(parseFirstChunk(Buffer.from([0, 2, 0, 0, 0])), new Error(ERROR_INVALID_DICTIONARY_SIZE))
    await assert.rejects(parseFirstChunk(Buffer.from([0, 8, 0, 0, 0])), new Error(ERROR_INVALID_DICTIONARY_SIZE))
  })
})

describe('generateAsciiTables', () => {
  it('is a function', () => {
    assert.strictEqual(typeof generateAsciiTables, 'function')
  })
})

describe('generateDecodeTables', () => {
  it('is a function', () => {
    assert.strictEqual(typeof generateDecodeTables, 'function')
  })
})

describe('explode', () => {
  it('is a function', () => {
    assert.strictEqual(typeof explode, 'function')
  })
  it('can decode files, which have been compressed with ascii mode', done => {
    Promise.all([readToBuffer('test/files/large.unpacked'), decompressToBuffer('test/files/large.ascii')])
      .then(([expected, result]) => {
        buffersShouldEqual(expected, result)
      })
      .then(done, done)
  })
  it('can decode files, which have been compressed with binary mode', done => {
    Promise.all([readToBuffer('test/files/binary.unpacked'), decompressToBuffer('test/files/binary')])
      .then(([expected, result]) => {
        buffersShouldEqual(expected, result)
      })
      .then(done, done)
  })
  it('can decode files, which have been compressed with small dictionary size', done => {
    Promise.all([readToBuffer('test/files/small.unpacked'), decompressToBuffer('test/files/small')])
      .then(([expected, result]) => {
        buffersShouldEqual(expected, result)
      })
      .then(done, done)
  })
  it('can decode files, which have been compressed with medium dictionary size', done => {
    Promise.all([readToBuffer('test/files/medium.unpacked'), decompressToBuffer('test/files/medium')])
      .then(([expected, result]) => {
        buffersShouldEqual(expected, result)
      })
      .then(done, done)
  })
  it('can decode files, which have been compressed with large dictionary size', done => {
    Promise.all([readToBuffer('test/files/large.unpacked'), decompressToBuffer('test/files/large')])
      .then(([expected, result]) => {
        buffersShouldEqual(expected, result)
      })
      .then(done, done)
  })
  it('can decode files, which span over multiple chunks', done => {
    Promise.all([readToBuffer('test/files/large.unpacked'), decompressToBuffer('test/files/large', 97)])
      .then(([expected, result]) => {
        buffersShouldEqual(expected, result)
      })
      .then(done, done)
  })
})
