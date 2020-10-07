#!/usr/bin/env node --experimental-modules

import fs from 'fs'
import minimist from 'minimist'
import { explode } from '../src/index.mjs'
import { isNil } from '../node_modules/ramda/src/index.mjs'
import { transformSplitByIdx, transformIdentity, through } from '../src/helpers.mjs'
import { fileExists, getPackageVersion, isDecimalString, isHexadecimalString } from './helpers.mjs'

const decompress = (input, output, offset) => {
  const handler = isNil(offset) ? explode() : transformSplitByIdx(offset, transformIdentity(), explode())

  return new Promise((resolve, reject) => {
    input.pipe(through(handler).on('error', reject)).pipe(output).on('finish', resolve).on('error', reject)
  })
}

const args = minimist(process.argv.slice(2), {
  string: ['output', 'offset'],
  boolean: ['version']
})

if (args.version) {
  console.log(getPackageVersion())
  process.exit(0)
}

let input = args._[0]
let output = args.output

let hasErrors = false

if (input) {
  if (fileExists(input)) {
    input = fs.createReadStream(input)
  } else {
    console.error('error: input file does not exist')
    hasErrors = true
  }
} else {
  input = process.openStdin()
}

if (output) {
  output = fs.createWriteStream(output)
} else {
  output = process.stdout
}

if (hasErrors) {
  process.exit(1)
}

let offset = args.offset
if (isDecimalString(offset)) {
  offset = parseInt(offset)
} else if (isHexadecimalString(offset)) {
  offset = parseInt(offset.replace(/^0x/, ''), 16)
} else {
  offset = 0
}

decompress(input, output, offset)
  .then(() => {
    process.exit(0)
  })
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
