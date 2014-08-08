(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `Buffer._useTypedArrays`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (compatible down to IE6)
 */
Buffer._useTypedArrays = (function () {
  // Detect if browser supports Typed Arrays. Supported browsers are IE 10+, Firefox 4+,
  // Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+. If the browser does not support adding
  // properties to `Uint8Array` instances, then that's the same as no `Uint8Array` support
  // because we need to be able to add all the node Buffer API methods. This is an issue
  // in Firefox 4-29. Now fixed: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() &&
        typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Workaround: node's base64 implementation allows for non-padded strings
  // while base64-js does not.
  if (encoding === 'base64' && type === 'string') {
    subject = stringtrim(subject)
    while (subject.length % 4 !== 0) {
      subject = subject + '='
    }
  }

  // Find the length
  var length
  if (type === 'number')
    length = coerce(subject)
  else if (type === 'string')
    length = Buffer.byteLength(subject, encoding)
  else if (type === 'object')
    length = coerce(subject.length) // assume that object is array-like
  else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (Buffer._useTypedArrays) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer._useTypedArrays && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    for (i = 0; i < length; i++) {
      if (Buffer.isBuffer(subject))
        buf[i] = subject.readUInt8(i)
      else
        buf[i] = subject[i]
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return !!(b !== null && b !== undefined && b._isBuffer)
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str + ''
  switch (encoding || 'utf8') {
    case 'hex':
      ret = str.length / 2
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list, [totalLength])\n' +
      'list should be an Array.')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (typeof totalLength !== 'number') {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

// BUFFER INSTANCE METHODS
// =======================

function _hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  Buffer._charsWritten = i * 2
  return i
}

function _utf8Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function _asciiWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function _binaryWrite (buf, string, offset, length) {
  return _asciiWrite(buf, string, offset, length)
}

function _base64Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function _utf16leWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf16leToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = _asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = _binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = _base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leWrite(this, string, offset, length)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end !== undefined)
    ? Number(end)
    : end = self.length

  // Fastpath empty strings
  if (end === start)
    return ''

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexSlice(self, start, end)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Slice(self, start, end)
      break
    case 'ascii':
      ret = _asciiSlice(self, start, end)
      break
    case 'binary':
      ret = _binarySlice(self, start, end)
      break
    case 'base64':
      ret = _base64Slice(self, start, end)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leSlice(self, start, end)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 100 || !Buffer._useTypedArrays) {
    for (var i = 0; i < len; i++)
      target[i + target_start] = this[i + start]
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

function _base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function _utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function _asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++)
    ret += String.fromCharCode(buf[i])
  return ret
}

function _binarySlice (buf, start, end) {
  return _asciiSlice(buf, start, end)
}

function _hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function _utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i+1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = clamp(start, len, 0)
  end = clamp(end, len, len)

  if (Buffer._useTypedArrays) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  return this[offset]
}

function _readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return _readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return _readUInt16(this, offset, false, noAssert)
}

function _readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return _readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return _readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  var neg = this[offset] & 0x80
  if (neg)
    return (0xff - this[offset] + 1) * -1
  else
    return this[offset]
}

function _readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return _readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return _readInt16(this, offset, false, noAssert)
}

function _readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return _readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return _readInt32(this, offset, false, noAssert)
}

function _readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return _readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return _readFloat(this, offset, false, noAssert)
}

function _readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return _readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return _readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= this.length) return

  this[offset] = value
}

function _writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, false, noAssert)
}

function _writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= this.length)
    return

  if (value >= 0)
    this.writeUInt8(value, offset, noAssert)
  else
    this.writeUInt8(0xff + value + 1, offset, noAssert)
}

function _writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, false, noAssert)
}

function _writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, false, noAssert)
}

function _writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, false, noAssert)
}

function _writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (typeof value === 'string') {
    value = value.charCodeAt(0)
  }

  assert(typeof value === 'number' && !isNaN(value), 'value is not a number')
  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  for (var i = start; i < end; i++) {
    this[i] = value
  }
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer._useTypedArrays) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1)
        buf[i] = this[i]
      return buf.buffer
    }
  } else {
    throw new Error('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

// slice(start, end)
function clamp (index, len, defaultValue) {
  if (typeof index !== 'number') return defaultValue
  index = ~~index;  // Coerce to integer.
  if (index >= len) return len
  if (index >= 0) return index
  index += len
  if (index >= 0) return index
  return 0
}

function coerce (length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length)
  return length < 0 ? 0 : length
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F)
      byteArray.push(str.charCodeAt(i))
    else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16))
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  var pos
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value >= 0, 'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754 (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/index.js","/../node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer")
},{"1YiZ5S":4,"base64-js":2,"buffer":1,"ieee754":3}],2:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS)
			return 62 // '+'
		if (code === SLASH)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/node_modules/base64-js/lib/b64.js","/../node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/node_modules/base64-js/lib")
},{"1YiZ5S":4,"buffer":1}],3:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/node_modules/ieee754/index.js","/../node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/node_modules/ieee754")
},{"1YiZ5S":4,"buffer":1}],4:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../node_modules/gulp-browserify/node_modules/browserify/node_modules/process/browser.js","/../node_modules/gulp-browserify/node_modules/browserify/node_modules/process")
},{"1YiZ5S":4,"buffer":1}],5:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var isInstanceOf = require('./lang/common/isInstanceOf.js').isInstanceOf;

function Any() {
}

Any.prototype = {
  name: 'Any',

  __Any__: true,

  isInstanceOf: function (classLike) {
    return isInstanceOf(this, classLike);
  },

  getClass: function () {
    return this.__name__;
  }
};

exports.Any  = Any;

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/Any.js","/")
},{"./lang/common/isInstanceOf.js":22,"1YiZ5S":4,"buffer":1}],6:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var Trait = require('./lang/Trait.js').Trait;

var Equals = Trait("Equals").body({
  canEqual: Trait.required,
  equals: Trait.required
});

exports.Equals = Equals;

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/Equals.js","/")
},{"./lang/Trait.js":17,"1YiZ5S":4,"buffer":1}],7:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var s = require('./global.js').s;

var lang = require('./lang.js');
var Class = lang.Class;
var CaseClass = lang.CaseClass;
var CaseSingleton = lang.CaseSingleton;
var Trait = lang.Trait;

var common = require('./lang/common.js');
var result = common.result;
var equals = common.equals;

var NoSuchElementException = require('./lang/exception.js').NoSuchElementException;

var Option = Trait(function Option(x) {
  if (x === null || x === undefined) {
    return None;
  }
  else {
    return Some(x);
  }
}).body({

  isEmpty: Trait.required,

  isDefined: function () {
    return !this.isEmpty();
  },

  // TODO: Rename to avoid JS Object conflict?
  get: function () {
    throw new Error("TODO: NotImplementedError");
  },

  getOrElse: function (def, context) {
    if (this.isEmpty()) {
      return result(def, context);
    } else {
      return this.get();
    }
  },

  orNull: function () {
    return this.getOrElse(null);
  },

  map: function (f, context) {
    if (this.isEmpty()) {
      return None;
    } else {
      return Some(f.call(context, this.get()));
    }
  },
  
  // TODO: fold or reduce?
  fold: function (ifEmpty, contextIfEmpty) {
    // TODO: Better way to document this / better way for partial application?
    return function (f, context) {
      if (this.isEmpty()) {
        return result(ifEmpty, contextIfEmpty);
      } else {
        return f.call(context, this.get());
      }
    }.bind(this);
  },

  // TODO: fold or reduce?
  reduce: function (f, ifEmpty, context) {
    if (this.isEmpty()) {
      return result(ifEmpty, context);
    } else {
      return f.call(context, this.get());
    }
  },
  
  flatMap: function (f, context) {
    if (this.isEmpty()) {
      return None;
    } else {
      return f.call(context, this.get());
    }
  },

  flatten: function () {
    if (this.isEmpty()) {
      return None;
    } else {
      return this.get();
    }
  },

  filter: function (p, context) {
    if (this.isEmpty() || p.call(context, this.get())) {
      return this;
    } else {
      return None;
    }
  },

  filterNot: function (p, context) {
    if (this.isEmpty() || !p.call(context, this.get())) {
      return this;
    } else {
      return None;
    }
  },

  nonEmpty: function () {
    return this.isDefined();
  },

  // TODO: This is the exact same code as in Try
  withFilter: function (p, context) {
    var self = this;

    var WithFilter = Class(function WithFilter(p, context) {
      this.p = p;
      this.context = context;
    }).body({
      map: function (f, context) {
        return self.filter(this.p, this.context).map(f, context);
      },
      flatMap: function (f, context) {
        return self.filter(this.p, this.context).flatMap(f, context);
      },
      forEach: function (f, context) {
        return self.filter(this.p, this.context).forEach(f, context);
      },
      withFilter: function (q, context) {
        return new WithFilter(function (x) {
          return this.p.call(this.context, x) && q.call(context, x);
        }.bind(this), context);
      }
    });

    return new WithFilter(p, context);
  },

  contains: function (elem) {
    return !this.isEmpty() && equals(this.get(), elem);
  },

  exists: function (p, context) {
    return !this.isEmpty() && p.call(context, this.get());
  },

  forAll: function (p, context) {
    return this.isEmpty() || p.call(context, this.get());
  },

  forEach: function (f, context) {
    if (!this.isEmpty()) {
      return f.call(context, this.get());
    }
  },

  // TODO: collect

  orElse: function (alternative, context) {
    if (this.isEmpty()) {
      return result(alternative, context);
    } else {
      return this;
    }
  },

  // TODO: iterator

  // TODO: toList

  toRight: function (left, context) {
    if (s.Either) {
      return this.isEmpty() ? s.Left(result(left, context)) : s.Right(this.get());
    } else {
      throw Error("Module 'Either' not loaded.");
    }
  },

  toLeft: function (right, context) {
    if (s.Either) {
      return this.isEmpty() ? s.Right(result(right, context)) : s.Left(this.get());
    } else {
      throw Error("Module 'Either' not loaded.");
    }
  }
});

Option.empty = function () {
  return None;
};

var Some = CaseClass(function Some(x) {
  this.x = x;
}).extends(Option).body({

  get: function () {
    return this.x;
  },

  isEmpty: function () {
    return false;
  }
});

var None = CaseSingleton(function None() {
}).extends(Option).body({

  get: function () {
    throw new NoSuchElementException("None.get");
  },

  isEmpty: function () {
    return true;
  }
});

exports.Option = Option;
exports.Some = Some;
exports.None = None;


}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/Option.js","/")
},{"./global.js":11,"./lang.js":12,"./lang/common.js":18,"./lang/exception.js":27,"1YiZ5S":4,"buffer":1}],8:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var s = require('./global.js').s;

var Any = require('./Any.js').Any;
var Equals = require('./Equals.js').Equals;

var Class = require('./lang/Class.js').Class;
var Trait = require('./lang/Trait.js').Trait;

var exception = require('./lang/exception.js');
var IndexOutOfBoundsException = exception.IndexOutOfBoundsException;

var equals = require('./lang/common/equals.js').equals;
var isInstanceOf = require('./lang/common/isInstanceOf.js').isInstanceOf;

var Product = Trait("Product").with(Equals).body({
  productElement: function (n) {
    if (n < this.productArity()) {
      return this['_' + (n + 1)];
    } else {
      throw new IndexOutOfBoundsException(n);
    }
  },

  productArity: Trait.required,

  productIterator: function () {
    var self = this;
    var c = 0;
    var cmax = self.productArity();
    return new (Class(AbstractIterator).body({
      hasNext: function () {
        return c < cmax;
      },
      next: function () {
        var result = self.productElement(c);
        c++;
        return result;
      }
    }));
  },

  // Hacky implementation, good enough for now
  toString: function () {
    var values = [];
    for (var i = 0; i < this.productArity(); i++) {
      values.push(this.productElement(i).toString());
    }
    return this.productPrefix + '(' + values.join(',') + ')';
  },

  canEqual: function (That) {
    return isInstanceOf(this, That);
  },

  equals: function (other) {
    if (this.__name__ === other.__name__) {
      if (other.productArity && this.productArity() === other.productArity()) {
        var res = true;
        for (var i = 0; i < this.productArity(); i++) {
          res = res && equals(this.productElement(i), other.productElement(i))
        }
        return res
      }
    }
    return false;
  },

  // ???
  productPrefix: ''

});

var Product1 = Trait("Product1").extends(Product).body({
  productArity: function () {
    return 1;
  },

  _1: Trait.required
});

var Product2 = Trait("Product2").extends(Product).body({
  productArity: function () {
    return 2;
  },

  _1: Trait.required,
  _2: Trait.required
});

var Product3 = Trait("Product3").extends(Product).body({
  productArity: function () {
    return 3;
  },

  _1: Trait.required,
  _2: Trait.required,
  _3: Trait.required
});

function createProduct(n) {
  var body = {
    productArity: function () {
      return n;
    }
  };

  for (var i = 1; i <= n; i++) {
    body['_' + i] = Trait.required;
  }

  return Trait("Product" + n).extends(Product).body(body);
}

function getProduct(n) {
  if (!s['Product' + n]) {
    s['Product' + n] = createProduct(n);
  }
  return s['Product' + n];
}

exports.Product = Product;
exports.Product1 = Product1;
exports.Product2 = Product2;
exports.Product3 = Product3;
exports.getProduct = getProduct;

for (var i = 4; i <= 22; i++) {
  exports['Product' + i] = getProduct(i);
}

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/Product.js","/")
},{"./Any.js":5,"./Equals.js":6,"./global.js":11,"./lang/Class.js":15,"./lang/Trait.js":17,"./lang/common/equals.js":20,"./lang/common/isInstanceOf.js":22,"./lang/exception.js":27,"1YiZ5S":4,"buffer":1}],9:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var s = require('./global.js').s;

var Any = require('./Any.js').Any;

var Class = require('./lang/Class.js').Class;
var CaseClass = require('./lang/CaseClass.js').CaseClass;

var product = require('./Product.js');
var Product = product.Product;
var Product1 = product.Product1;
var Product2 = product.Product2;
var Product3 = product.Product3;
var getProduct = product.getProduct;

var Tuple1 = CaseClass(function Tuple1(_1) {
}).extends(Product1).body();

var Tuple2 = CaseClass(function Tuple2(_1, _2) {
}).extends(Product2).body();

var Tuple3 = CaseClass(function Tuple3(_1, _2, _3) {
}).extends(Product3).body();

function createTuple(n) {
  var defaults = {};
  for (var i = 1; i <= n; i++) {
    defaults['_' + i] = undefined;
  }
  return CaseClass("Tuple" + n, defaults).extends(getProduct(n)).body();
}

function getTuple(n) {
  if (!s['Tuple' + n]) {
    s['Tuple' + n] = createTuple(n);
  }
  return s['Tuple' + n];
}

function t() {
  return getTuple(arguments.length).apply(undefined, arguments);
}

exports.Tuple1 = Tuple1;
exports.Tuple2 = Tuple2;
exports.Tuple3 = Tuple3;
exports.getTuple = getTuple;
exports.t = t;

for (var i = 4; i <= 22; i++) {
  exports['Tuple' + i] = getTuple(i);
}

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/Tuple.js","/")
},{"./Any.js":5,"./Product.js":8,"./global.js":11,"./lang/CaseClass.js":13,"./lang/Class.js":15,"1YiZ5S":4,"buffer":1}],10:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var s = require('./global.js').s;

var extend = require('./lang/common/extend.js').extend;

var lang = require('./lang.js');

var exception = require('./lang/exception.js');

var product = require('./Product.js');
var tuple = require('./Tuple.js');

var option = require('./Option.js');

var any = require('./Any.js');
var equals = require('./Equals.js');

s = extend(s, lang);
s = extend(s, exception);
s = extend(s, product);
s = extend(s, tuple);
s = extend(s, option);
s = extend(s, {
  _: undefined,
  Any: any.Any,
  Equals: equals.Equals
});

module.exports = s;

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/fake_26febe99.js","/")
},{"./Any.js":5,"./Equals.js":6,"./Option.js":7,"./Product.js":8,"./Tuple.js":9,"./global.js":11,"./lang.js":12,"./lang/common/extend.js":21,"./lang/exception.js":27,"1YiZ5S":4,"buffer":1}],11:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var s = {};
exports.s = s;

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/global.js","/")
},{"1YiZ5S":4,"buffer":1}],12:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var Class = require('./lang/Class.js').Class;
var Singleton = require('./lang/Singleton.js').Singleton;
var CaseClass = require('./lang/CaseClass.js').CaseClass;
var CaseSingleton = require('./lang/CaseSingleton.js').CaseSingleton;
var Trait = require('./lang/Trait.js').Trait;

var lang = {
  Class: Class,
  Singleton: Singleton,
  CaseClass: CaseClass,
  CaseSingleton: CaseSingleton,
  Trait: Trait
};

module.exports = lang;

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/lang.js","/")
},{"./lang/CaseClass.js":13,"./lang/CaseSingleton.js":14,"./lang/Class.js":15,"./lang/Singleton.js":16,"./lang/Trait.js":17,"1YiZ5S":4,"buffer":1}],13:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var Any = require('../Any.js').Any;

var makeClassBuilder = require('./Class.js').makeClassBuilder;
var makeWithTraitClassBuilder = require('./Class.js').makeWithTraitClassBuilder;

var caseClassify = require('./common/caseClassify.js').caseClassify;

var isFunction = require('./common/typeCheck.js').isFunction;
var isString = require('./common/typeCheck.js').isString;
var isArray = require('./common/typeCheck.js').isArray;
var isObject = require('./common/typeCheck.js').isObject;

function getName(fn) {
  // TODO: Cross-browser?
  return fn.name;
}

function makeCaseClassBuilder(ClassBuilder) {

  function CaseClassBuilder(name, Ctor) {
    if (isFunction(name)) {
      this.Ctor = name;
      this.name = getName(this.Ctor);
    }
    else if (isString(name)) {
      this.Ctor = function CaseClass() {
        if (this.constructor) {
          this.constructor.apply(this, arguments);
        }
      };
      this.name = name;
    }
    else {
      throw Error("wrong")
    }

    if (isObject(Ctor)) {
      this.defaults = Ctor;
    }

    this.Ctor.prototype = Object.create(Any.prototype);
    this.Ctor.prototype['__' + this.name + '__'] = true;
  }

  CaseClassBuilder.prototype = Object.create(ClassBuilder.prototype);

  CaseClassBuilder.prototype.body = function (body) {
    var Ctor = ClassBuilder.prototype.body.call(this, body); // super.body(body);
    return caseClassify(Ctor, this.name, this.defaults);
  };

  return CaseClassBuilder;
}

function makeWithTraitCaseClassBuilder(WithTraitClassBuilder) {

  function WithTraitCaseClassBuilder(instance) {
    this.name = instance.name;
    this.Ctor = instance.Ctor;
    this.defaults = instance.defaults;
  }

  WithTraitCaseClassBuilder.prototype = Object.create(WithTraitClassBuilder.prototype);

  WithTraitCaseClassBuilder.prototype.body = function (body) {
    var Ctor = WithTraitClassBuilder.prototype.body.call(this, body); // super.body(body);
    return caseClassify(Ctor, this.name, this.defaults);
  };

  return WithTraitCaseClassBuilder;
}

var WithTraitCaseClassBuilder = makeWithTraitCaseClassBuilder(makeWithTraitClassBuilder());
var CaseClassBuilder = makeCaseClassBuilder(makeClassBuilder(WithTraitCaseClassBuilder));

function CaseClass(name, Ctor) {
  return new CaseClassBuilder(name, Ctor);
}

exports.makeWithTraitCaseClassBuilder = makeWithTraitCaseClassBuilder;
exports.makeCaseClassBuilder = makeCaseClassBuilder;

//exports.CaseClassBuilder = CaseClassBuilder;
//exports.WithTraitCaseClassBuilder = WithTraitCaseClassBuilder;

exports.CaseClass = CaseClass;

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/lang/CaseClass.js","/lang")
},{"../Any.js":5,"./Class.js":15,"./common/caseClassify.js":19,"./common/typeCheck.js":25,"1YiZ5S":4,"buffer":1}],14:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var makeClassBuilder = require('./Class.js').makeClassBuilder;
var makeWithTraitClassBuilder = require('./Class.js').makeWithTraitClassBuilder;

var makeCaseClassBuilder = require('./CaseClass.js').makeCaseClassBuilder;
var makeWithTraitCaseClassBuilder = require('./CaseClass.js').makeWithTraitCaseClassBuilder;

var makeSingletonBuilder = require('./Singleton.js').makeSingletonBuilder;
var makeWithTraitSingletonBuilder = require('./Singleton.js').makeWithTraitSingletonBuilder;

// Where is your god now?
var WithTraitCaseSingletonBuilder = makeWithTraitSingletonBuilder(makeWithTraitCaseClassBuilder(makeWithTraitClassBuilder()));
var CaseSingletonBuilder = makeSingletonBuilder(makeCaseClassBuilder(makeClassBuilder(WithTraitCaseSingletonBuilder)));

function CaseSingleton(Ctor) {
  return new CaseSingletonBuilder(Ctor);
}

exports.CaseSingleton = CaseSingleton;

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/lang/CaseSingleton.js","/lang")
},{"./CaseClass.js":13,"./Class.js":15,"./Singleton.js":16,"1YiZ5S":4,"buffer":1}],15:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var Any = require('../Any.js').Any;

var extend = require('./common/extend.js').extend;
var isString = require('./common/typeCheck.js').isString;
var isFunction = require('./common/typeCheck.js').isFunction;

function makeClassBuilder(WithTraitClassBuilder) {
  function ClassBuilder(Ctor, name) {
    if (isFunction(Ctor)) {
      this.Ctor = Ctor;
      name = name || Ctor.name;
    } else {
      this.Ctor = function Class() {
        if (this.constructor) {
          this.constructor.apply(this, arguments);
        }
      };
      name = Ctor
    }

    this.name = name;
    this.Ctor.prototype = Object.create(Any.prototype);
    this.Ctor.prototype['__' + this.name + '__'] = true;
  }

  ClassBuilder.prototype = {
    body: function (body) {
      body = body || {};
      extend(this.Ctor.prototype, body);
      this.Ctor.prototype.name = this.name;
      this.Ctor.prototype.__name__ = this.name;
      return this.Ctor;
    },

    extendz: function (Parent) {
      this.Ctor.prototype = Object.create(Parent.prototype);

      if (!Parent.__Any__) {
        extend(this.Ctor.prototype, Any.prototype);
      }

      this.Ctor.prototype['__' + this.name + '__'] = true;

      return new WithTraitClassBuilder(this);
    },

    'extends': function (Parent) {
      return this.extendz(Parent);
    },

    withz: function (trt) {
      if (isFunction(trt)) { // Traits are functions
        extend(this.Ctor.prototype, trt.prototype);
        return new WithTraitClassBuilder(this);
      } else {
        return this.body(trt);
      }
    },

    'with': function (trt) {
      return this.withz(trt);
    }
  };

  return ClassBuilder;
}

function makeWithTraitClassBuilder() {
  function WithTraitClassBuilder(instance) {
    this.name = instance.name;
    this.Ctor = instance.Ctor;
  }

  WithTraitClassBuilder.prototype = {
    body: function (body) {
      body = body || {};
      extend(this.Ctor.prototype, body);
      this.Ctor.prototype.name = this.name;
      this.Ctor.prototype.__name__ = this.name;
      return this.Ctor;
    },

    withz: function (trt) {
      if (isFunction(trt)) { // Traits are functions
        extend(this.Ctor.prototype, trt.prototype);
        return this;
      } else {
        return this.body(trt);
      }
    },

    'with': function (trt) {
      return this.withz(trt);
    }
  };

  return WithTraitClassBuilder;
}

var WithTraitClassBuilder = makeWithTraitClassBuilder();
var ClassBuilder = makeClassBuilder(WithTraitClassBuilder);

function Class(Ctor, name) {
  return new ClassBuilder(Ctor, name);
}

exports.makeClassBuilder = makeClassBuilder;
exports.makeWithTraitClassBuilder = makeWithTraitClassBuilder;

//exports.ClassBuilder = ClassBuilder;
//exports.WithTraitClassBuilder = WithTraitClassBuilder;

exports.Class = Class;

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/lang/Class.js","/lang")
},{"../Any.js":5,"./common/extend.js":21,"./common/typeCheck.js":25,"1YiZ5S":4,"buffer":1}],16:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var makeClassBuilder = require('./Class.js').makeClassBuilder;
var makeWithTraitClassBuilder = require('./Class.js').makeWithTraitClassBuilder;

function makeSingletonBuilder(ClassBuilder) {

  function SingletonBuilder(Ctor) {
    ClassBuilder.call(this, Ctor);
  }

  SingletonBuilder.prototype = Object.create(ClassBuilder.prototype);

  SingletonBuilder.prototype.body = function (body) {
    var Ctor = ClassBuilder.prototype.body.call(this, body); // super.body(body);
    if (!Ctor.instance) {
      Ctor.instance = new Ctor();
    }
    return Ctor.instance;
  };

  return SingletonBuilder;
}

function makeWithTraitSingletonBuilder(WithTraitClassBuilder) {

  function WithTraitCaseClassBuilder(instance) {
    WithTraitClassBuilder.call(this, instance);
  }

  WithTraitCaseClassBuilder.prototype = Object.create(WithTraitClassBuilder.prototype);

  WithTraitCaseClassBuilder.prototype.body = function (body) {
    var Ctor = WithTraitClassBuilder.prototype.body.call(this, body); // super.body(body);
    if (!Ctor.instance) {
      Ctor.instance = new Ctor();
    }
    return Ctor.instance;
  };

  return WithTraitCaseClassBuilder;
}

var WithTraitSingletonBuilder = makeWithTraitSingletonBuilder(makeWithTraitClassBuilder());
var SingletonBuilder = makeSingletonBuilder(makeClassBuilder(WithTraitSingletonBuilder));

function Singleton(Ctor) {
  return new SingletonBuilder(Ctor);
}

exports.makeSingletonBuilder = makeSingletonBuilder;
exports.makeWithTraitSingletonBuilder = makeWithTraitSingletonBuilder;

//exports.SingletonBuilder = SingletonBuilder;
//exports.WithTraitSingletonBuilder = WithTraitSingletonBuilder;

exports.Singleton = Singleton;

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/lang/Singleton.js","/lang")
},{"./Class.js":15,"1YiZ5S":4,"buffer":1}],17:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var Any = require('../Any.js').Any;

var extend = require('./common/extend.js').extend;
var isFunction = require('./common/typeCheck.js').isFunction;

function TraitBuilder(name) {
  if (isFunction(name)) {
    this.Ctor = name;
    name = name.name;
  }
  else {
    this.Ctor = function Trait() {
    };
    this.Ctor.prototype = Object.create(Any.prototype);
  }

  this.Ctor.prototype.name = name;
  this.Ctor.prototype['__' + name + '__'] = true;
}

TraitBuilder.prototype = {
  withz: function (trt) {
    if (isFunction(trt)) { // Traits are functions
      extend(this.Ctor.prototype, trt.prototype);
      return this;
    } else {
      return this.body(trt);
    }
  },
  
  'with': function (trt) {
    return this.withz(trt);
  },
  
  extendz: function (trt) {
    this.Ctor.prototype = Object.create(trt.prototype);

    if (!trt.__Any__) {
      extend(this.Ctor.prototype, Any.prototype);
    }

    this.Ctor.prototype['__' + this.name + '__'] = true;
    
    // TODO: WithTraitTraitBuilder
    return this;
  },
  
  'extends': function (trt) {
    return this.extendz(trt);
  },
  
  body: function (body) {
    body = body || {};
    extend(this.Ctor.prototype, body);
    return this.Ctor;
  }
};

function Trait(name, body) {
  var traitBuilder = new TraitBuilder(name);
  return body ? traitBuilder.body(body) : traitBuilder;
}

Trait.required = function () {
  throw new Error("Not implemented");
};

exports.Trait = Trait;

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/lang/Trait.js","/lang")
},{"../Any.js":5,"./common/extend.js":21,"./common/typeCheck.js":25,"1YiZ5S":4,"buffer":1}],18:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var caseClassify = require('./common/caseClassify.js').caseClassify;
var equals = require('./common/equals.js').equals;
var extend = require('./common/extend.js').extend;
var isInstanceOf = require('./common/isInstanceOf.js').isInstanceOf;
var match = require('./common/match.js').match;
var result = require('./common/result.js').result;
var isFunction = require('./common/typeCheck.js').isFunction;
var isObject = require('./common/typeCheck.js').isObject;
var wrap = require('./common/wrap.js').wrap;

var common = {
  caseClassify: caseClassify,
  equals: equals,
  extend: extend,
  match: match,
  result: result,
  isFunction: isFunction,
  isObject: isObject,
  wrap: wrap
};

module.exports = common;

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/lang/common.js","/lang")
},{"./common/caseClassify.js":19,"./common/equals.js":20,"./common/extend.js":21,"./common/isInstanceOf.js":22,"./common/match.js":23,"./common/result.js":24,"./common/typeCheck.js":25,"./common/wrap.js":26,"1YiZ5S":4,"buffer":1}],19:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var IndexOutOfBoundsException = require('../exception.js').IndexOutOfBoundsException;
var Product = require('../../Product.js').Product;

var extend = require('./extend.js').extend;
var match = require('./match.js').match;

var isObject = require('./typeCheck.js').isObject;

/**
 * (c) Angular.js
 */
var FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
var FN_ARG_SPLIT = /,/;
var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;

/**
 * (c) Angular.js
 */
function getArgumentNames(fn) {
  var fnText, argDecl, res = [];

  if (typeof fn === 'function') {
    fnText = fn.toString().replace(STRIP_COMMENTS, '');
    argDecl = fnText.match(FN_ARGS);
    Array.prototype.forEach.call(argDecl[1].split(FN_ARG_SPLIT), function (arg) {
      res.push(arg.trim());
    });
  }

  return res;
}

function getName(fn) {
  // TODO: Cross-browser?
  return fn.name;
}

function caseClassify(Ctor, name, defaults) {
  
  name = name || getName(Ctor);
  var argumentNames = isObject(defaults) ? Object.keys(defaults) : getArgumentNames(Ctor);
  
  defaults = defaults || {}; // prevent exceptions
  
  var Factory = function () {
    return Factory.app.apply(undefined, arguments);
  };

  // TODO: What is the name property anyway?
  Factory.name = name;

  Factory.__product__ = name;

  Factory.fromJSON = function (jsonObj) {
    var cc = new Ctor();
    Object.keys(jsonObj).forEach(function (name) {
      cc[name] = jsonObj[name] || defaults[argumentNames[i]];
    });
    return cc;
  };

  Factory.app = function () {
    var cc = new Ctor();
    for (var i = 0; i < argumentNames.length; i++) {
      cc[argumentNames[i]] = arguments[i] || defaults[argumentNames[i]];
    }
    return cc;
  };

  Factory.unApp = function (cc) {
    return argumentNames.map(function (name) {
      return cc[name];
    });
  };

  extend(Ctor.prototype, Product.prototype);
  extend(Ctor.prototype, {

    // TODO: Better name?
    __factory__: Factory,

    name: name,

    copy: function (patchObj) {
      var copy = new Ctor({});
      argumentNames.forEach(function (name) {
        if (patchObj[name]) copy[name] = patchObj[name];
        else copy[name] = this[name];
      }, this);
      return copy;
    },

    productArity: function () {
      return argumentNames.length;
    },

    productElement: function (n) {
      if (n < argumentNames.length) {
        return this[argumentNames[n]];
      } else {
        throw new IndexOutOfBoundsException();
      }
    },

    productPrefix: name,

    /*
     equals: function (other) {
     if (other.isInstanceOf(Product)) {
     if (this.productArity() === other.productArity()) {
     return this.productIterator().sameElements(other.productIterator());
     }
     }

     return false;
     },
     */

    hashCode: function () {
      console.warn("hashCode implementation missing");
      return -1;
    },

    /*
     toString: function () {
     return this.productIterator().mkString(this.productPrefix + "(", ",", ")");
     },
     */

    // this isn't really required. JSON.stringify works anyway...
    toJSON: function () {
      var res = {};
      argumentNames.map(function (name) {
        res[name] = this[name];
      }, this);
      return res;
    },

    /**
     * Start a pseudo pattern match
     * @return {*}
     */
    match: function () {
      return match(this);
    }
  });

  return Factory;
}

exports.caseClassify = caseClassify;

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/lang/common/caseClassify.js","/lang/common")
},{"../../Product.js":8,"../exception.js":27,"./extend.js":21,"./match.js":23,"./typeCheck.js":25,"1YiZ5S":4,"buffer":1}],20:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
function equals(o1, o2) {
  if (o1.equals) {
    if (o2.equals) {
      return o1.equals(o2);
    } else {
      return false;
    }
  } else {
    if (o2.equals) {
      return false;
    } else {
      return o1 === o2;
    }
  }
}

exports.equals = equals;

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/lang/common/equals.js","/lang/common")
},{"1YiZ5S":4,"buffer":1}],21:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
function extend(obj, by) {
  by = by || {};
  Object.keys(by).forEach(function (key) {
    obj[key] = by[key];
  });
  return obj;
}

exports.extend = extend;

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/lang/common/extend.js","/lang/common")
},{"1YiZ5S":4,"buffer":1}],22:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var isString = require('./typeCheck.js').isString;

// TODO: less fuckup
function isInstanceOf(that, classLike) {
  if (isString(classLike)) {
    return that['__' + classLike + '__'] === true;
  } else if (classLike.__name__) {
    return that['__' + classLike.__name__ + '__'] === true;
  } else if (classLike.prototype.__name__) {
    return that['__' + classLike.prototype.__name__ + '__'] === true;
  } else if (classLike.__product__) {
    return that['__' + classLike.__product__ + '__'] === true;
  } else {
    return that instanceof classLike;
  }
}

exports.isInstanceOf = isInstanceOf;

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/lang/common/isInstanceOf.js","/lang/common")
},{"./typeCheck.js":25,"1YiZ5S":4,"buffer":1}],23:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var equals = require('./equals.js').equals;
var extend = require('./extend.js').extend;
var isFunction = require('./typeCheck.js').isFunction;

var Class = require('../Class.js').Class;

var Case = Class(function Case(o) {
  this.o = o;
}).with({
  /**
   *
   * @param {B} other - An arbitrary object to compare to
   * @param {function(B): R} f - A callback function if it is a match.
   * @param {object=} context
   * @return {Match|Case}
   */
  caze: function (other, f, context) {
    if (other !== undefined) {
      return this.doCase(other, f, context);
    } else {
      return this.default(f, context);
    }
  },

  doCase: function (other, f, context) {
    return (equals(this.o, other)) ?
      new Match(f.call(context, this.o)) :
      this;
  },

  getz: function () {
    throw new Error("MatchError");
  },

  defaultz: function (f, context) {
    return new Match(f.call(context, this.o));
  },

  // Alias

  'case': function (other, f, context) {
    return this.caze(other, f, context);
  },

  'get': function () {
    return this.getz();
  },

  'default': function (f, context) {
    return this.defaultz(f, context);
  }
});

var CaseClassCase = Class(function CaseClassCase(o) {
  this.o = o;
}).extends(Case).with({
  doCase: function (Class, f, context) {
    return (this.o.__factory__.__product__ === Class.__product__ || /* CaseSingleton */ this.o === Class) ?
      new Match(f.apply(context, unApp(Class, this.o))) :
      this;
  }
});

// TODO: recursive unApp
function unApp(Class, o) {
  return Class.unApp ?
    Class.unApp(o) :
    [o];
}

var ConstructorCase = Class(function ConstructorCase(o) {
  this.o = o;
}).extends(Case).with({
  doCase: function (Class, f, context) {
    return (this.o instanceof Class) ?
      new Match(f.call(context, this.o)) :
      this;
  }
});

/**
 * Represents a match.
 * All further calls to 'case' will be ignored.
 *
 * @param {R} res The result of the case callback function
 * @constructor
 */
function Match(res) {
  this.res = res;
}

var Match = Class(function (res) {
  this.res = res;
}).extends(Case).with({
  doCase: function () {
    return this;
  },

  getz: function () {
    return this.res;
  },

  defaultz: function () {
    return this.res;
  },

  'get': function () {
    return this.res;
  },

  'default': function () {
    return this.res;
  }
});

/**
 * Starts a pseudo pattern-match.
 *
 * @param {*} o
 * @return {Case}
 */
function match(o) {
  if (o.__factory__ && o.__factory__.unApp) {
    return new CaseClassCase(o);
//} else if (o.__Any__) {
  // return new ClassCase(o);
  } else if (isFunction(o)) {
    return new ConstructorCase(o);
  } else {
    return new Case(o);
  }
}

exports.match = match;

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/lang/common/match.js","/lang/common")
},{"../Class.js":15,"./equals.js":20,"./extend.js":21,"./typeCheck.js":25,"1YiZ5S":4,"buffer":1}],24:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var isFunction = require('./typeCheck.js').isFunction;

function result(value, context) {
  return isFunction(value) ? value.call(context) : value;
}

exports.result = result;

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/lang/common/result.js","/lang/common")
},{"./typeCheck.js":25,"1YiZ5S":4,"buffer":1}],25:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
['Function', 'Object']
  .forEach(function (name) {
    exports['is' + name] = function (obj) {
      return typeof obj === name.toLowerCase();
    }
  });

exports.isString = function (s) {
  return typeof s === 'string';
};

exports.isArray = function (arr) {
  return Array.isArray(arr);
};

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/lang/common/typeCheck.js","/lang/common")
},{"1YiZ5S":4,"buffer":1}],26:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var extend = require('./extend.js').extend;
var isFunction = require('./typeCheck.js').isFunction;

function wrap(target) {
  function Wrapped () {
    return target.app.apply(target, arguments);
  }
  
  Object.keys(target).forEach(function (key) {
    var value = target[key];
    if (isFunction(value)) {
      Wrapped[key] = value.bind(target);
    } else {
      Wrapped[key] = value;
    }
  });

  return Wrapped;
}

exports.wrap = wrap;

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/lang/common/wrap.js","/lang/common")
},{"./extend.js":21,"./typeCheck.js":25,"1YiZ5S":4,"buffer":1}],27:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var Class = require('./Class.js').Class;

var Throwable = Class("Throwable").extends(Error).body({
  constructor: function (message, fileName, lineNumber) {
    Error.call(this, arguments);
    Error.captureStackTrace(this, this.prototype);

    if (message) this.message = message;
    if (fileName) this.fileName = fileName;
    if (lineNumber) this.lineNumber = lineNumber;
  }
});

var Exception = Class("Exception").extends(Throwable).body({});
var RuntimeException = Class("RuntimeException").extends(Exception).body({});
var NoSuchElementException = Class("NoSuchElementException").extends(RuntimeException).body({});
var UnsupportedOperationException = Class("UnsupportedOperationException").extends(RuntimeException).body({});
var IndexOutOfBoundsException = Class("IndexOutOfBoundsException").extends(RuntimeException).body({});
var IllegalArgumentException = Class("IllegalArgumentException").extends(RuntimeException).body({});
// TODO

exports.Throwable = Throwable;
exports.Exception = Exception;
exports.RuntimeException = RuntimeException;
exports.NoSuchElementException = NoSuchElementException;
exports.UnsupportedOperationException = UnsupportedOperationException;
exports.IndexOutOfBoundsException = IndexOutOfBoundsException;
exports.IllegalArgumentException = IllegalArgumentException;

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/lang/exception.js","/lang")
},{"./Class.js":15,"1YiZ5S":4,"buffer":1}]},{},[10])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy9jZWxsMzAzL3Mvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwiL1VzZXJzL2NlbGwzMDMvcy9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvaW5kZXguanMiLCIvVXNlcnMvY2VsbDMwMy9zL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvYmFzZTY0LWpzL2xpYi9iNjQuanMiLCIvVXNlcnMvY2VsbDMwMy9zL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvaWVlZTc1NC9pbmRleC5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIiwiL1VzZXJzL2NlbGwzMDMvcy9zcmMvQW55LmpzIiwiL1VzZXJzL2NlbGwzMDMvcy9zcmMvRXF1YWxzLmpzIiwiL1VzZXJzL2NlbGwzMDMvcy9zcmMvT3B0aW9uLmpzIiwiL1VzZXJzL2NlbGwzMDMvcy9zcmMvUHJvZHVjdC5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvc3JjL1R1cGxlLmpzIiwiL1VzZXJzL2NlbGwzMDMvcy9zcmMvZmFrZV8yNmZlYmU5OS5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvc3JjL2dsb2JhbC5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvc3JjL2xhbmcuanMiLCIvVXNlcnMvY2VsbDMwMy9zL3NyYy9sYW5nL0Nhc2VDbGFzcy5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvc3JjL2xhbmcvQ2FzZVNpbmdsZXRvbi5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvc3JjL2xhbmcvQ2xhc3MuanMiLCIvVXNlcnMvY2VsbDMwMy9zL3NyYy9sYW5nL1NpbmdsZXRvbi5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvc3JjL2xhbmcvVHJhaXQuanMiLCIvVXNlcnMvY2VsbDMwMy9zL3NyYy9sYW5nL2NvbW1vbi5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvc3JjL2xhbmcvY29tbW9uL2Nhc2VDbGFzc2lmeS5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvc3JjL2xhbmcvY29tbW9uL2VxdWFscy5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvc3JjL2xhbmcvY29tbW9uL2V4dGVuZC5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvc3JjL2xhbmcvY29tbW9uL2lzSW5zdGFuY2VPZi5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvc3JjL2xhbmcvY29tbW9uL21hdGNoLmpzIiwiL1VzZXJzL2NlbGwzMDMvcy9zcmMvbGFuZy9jb21tb24vcmVzdWx0LmpzIiwiL1VzZXJzL2NlbGwzMDMvcy9zcmMvbGFuZy9jb21tb24vdHlwZUNoZWNrLmpzIiwiL1VzZXJzL2NlbGwzMDMvcy9zcmMvbGFuZy9jb21tb24vd3JhcC5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvc3JjL2xhbmcvZXhjZXB0aW9uLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2bENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOU5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6SkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG4vKiFcbiAqIFRoZSBidWZmZXIgbW9kdWxlIGZyb20gbm9kZS5qcywgZm9yIHRoZSBicm93c2VyLlxuICpcbiAqIEBhdXRob3IgICBGZXJvc3MgQWJvdWtoYWRpamVoIDxmZXJvc3NAZmVyb3NzLm9yZz4gPGh0dHA6Ly9mZXJvc3Mub3JnPlxuICogQGxpY2Vuc2UgIE1JVFxuICovXG5cbnZhciBiYXNlNjQgPSByZXF1aXJlKCdiYXNlNjQtanMnKVxudmFyIGllZWU3NTQgPSByZXF1aXJlKCdpZWVlNzU0JylcblxuZXhwb3J0cy5CdWZmZXIgPSBCdWZmZXJcbmV4cG9ydHMuU2xvd0J1ZmZlciA9IEJ1ZmZlclxuZXhwb3J0cy5JTlNQRUNUX01BWF9CWVRFUyA9IDUwXG5CdWZmZXIucG9vbFNpemUgPSA4MTkyXG5cbi8qKlxuICogSWYgYEJ1ZmZlci5fdXNlVHlwZWRBcnJheXNgOlxuICogICA9PT0gdHJ1ZSAgICBVc2UgVWludDhBcnJheSBpbXBsZW1lbnRhdGlvbiAoZmFzdGVzdClcbiAqICAgPT09IGZhbHNlICAgVXNlIE9iamVjdCBpbXBsZW1lbnRhdGlvbiAoY29tcGF0aWJsZSBkb3duIHRvIElFNilcbiAqL1xuQnVmZmVyLl91c2VUeXBlZEFycmF5cyA9IChmdW5jdGlvbiAoKSB7XG4gIC8vIERldGVjdCBpZiBicm93c2VyIHN1cHBvcnRzIFR5cGVkIEFycmF5cy4gU3VwcG9ydGVkIGJyb3dzZXJzIGFyZSBJRSAxMCssIEZpcmVmb3ggNCssXG4gIC8vIENocm9tZSA3KywgU2FmYXJpIDUuMSssIE9wZXJhIDExLjYrLCBpT1MgNC4yKy4gSWYgdGhlIGJyb3dzZXIgZG9lcyBub3Qgc3VwcG9ydCBhZGRpbmdcbiAgLy8gcHJvcGVydGllcyB0byBgVWludDhBcnJheWAgaW5zdGFuY2VzLCB0aGVuIHRoYXQncyB0aGUgc2FtZSBhcyBubyBgVWludDhBcnJheWAgc3VwcG9ydFxuICAvLyBiZWNhdXNlIHdlIG5lZWQgdG8gYmUgYWJsZSB0byBhZGQgYWxsIHRoZSBub2RlIEJ1ZmZlciBBUEkgbWV0aG9kcy4gVGhpcyBpcyBhbiBpc3N1ZVxuICAvLyBpbiBGaXJlZm94IDQtMjkuIE5vdyBmaXhlZDogaHR0cHM6Ly9idWd6aWxsYS5tb3ppbGxhLm9yZy9zaG93X2J1Zy5jZ2k/aWQ9Njk1NDM4XG4gIHRyeSB7XG4gICAgdmFyIGJ1ZiA9IG5ldyBBcnJheUJ1ZmZlcigwKVxuICAgIHZhciBhcnIgPSBuZXcgVWludDhBcnJheShidWYpXG4gICAgYXJyLmZvbyA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIDQyIH1cbiAgICByZXR1cm4gNDIgPT09IGFyci5mb28oKSAmJlxuICAgICAgICB0eXBlb2YgYXJyLnN1YmFycmF5ID09PSAnZnVuY3Rpb24nIC8vIENocm9tZSA5LTEwIGxhY2sgYHN1YmFycmF5YFxuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cbn0pKClcblxuLyoqXG4gKiBDbGFzczogQnVmZmVyXG4gKiA9PT09PT09PT09PT09XG4gKlxuICogVGhlIEJ1ZmZlciBjb25zdHJ1Y3RvciByZXR1cm5zIGluc3RhbmNlcyBvZiBgVWludDhBcnJheWAgdGhhdCBhcmUgYXVnbWVudGVkXG4gKiB3aXRoIGZ1bmN0aW9uIHByb3BlcnRpZXMgZm9yIGFsbCB0aGUgbm9kZSBgQnVmZmVyYCBBUEkgZnVuY3Rpb25zLiBXZSB1c2VcbiAqIGBVaW50OEFycmF5YCBzbyB0aGF0IHNxdWFyZSBicmFja2V0IG5vdGF0aW9uIHdvcmtzIGFzIGV4cGVjdGVkIC0tIGl0IHJldHVybnNcbiAqIGEgc2luZ2xlIG9jdGV0LlxuICpcbiAqIEJ5IGF1Z21lbnRpbmcgdGhlIGluc3RhbmNlcywgd2UgY2FuIGF2b2lkIG1vZGlmeWluZyB0aGUgYFVpbnQ4QXJyYXlgXG4gKiBwcm90b3R5cGUuXG4gKi9cbmZ1bmN0aW9uIEJ1ZmZlciAoc3ViamVjdCwgZW5jb2RpbmcsIG5vWmVybykge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgQnVmZmVyKSlcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcihzdWJqZWN0LCBlbmNvZGluZywgbm9aZXJvKVxuXG4gIHZhciB0eXBlID0gdHlwZW9mIHN1YmplY3RcblxuICAvLyBXb3JrYXJvdW5kOiBub2RlJ3MgYmFzZTY0IGltcGxlbWVudGF0aW9uIGFsbG93cyBmb3Igbm9uLXBhZGRlZCBzdHJpbmdzXG4gIC8vIHdoaWxlIGJhc2U2NC1qcyBkb2VzIG5vdC5cbiAgaWYgKGVuY29kaW5nID09PSAnYmFzZTY0JyAmJiB0eXBlID09PSAnc3RyaW5nJykge1xuICAgIHN1YmplY3QgPSBzdHJpbmd0cmltKHN1YmplY3QpXG4gICAgd2hpbGUgKHN1YmplY3QubGVuZ3RoICUgNCAhPT0gMCkge1xuICAgICAgc3ViamVjdCA9IHN1YmplY3QgKyAnPSdcbiAgICB9XG4gIH1cblxuICAvLyBGaW5kIHRoZSBsZW5ndGhcbiAgdmFyIGxlbmd0aFxuICBpZiAodHlwZSA9PT0gJ251bWJlcicpXG4gICAgbGVuZ3RoID0gY29lcmNlKHN1YmplY3QpXG4gIGVsc2UgaWYgKHR5cGUgPT09ICdzdHJpbmcnKVxuICAgIGxlbmd0aCA9IEJ1ZmZlci5ieXRlTGVuZ3RoKHN1YmplY3QsIGVuY29kaW5nKVxuICBlbHNlIGlmICh0eXBlID09PSAnb2JqZWN0JylcbiAgICBsZW5ndGggPSBjb2VyY2Uoc3ViamVjdC5sZW5ndGgpIC8vIGFzc3VtZSB0aGF0IG9iamVjdCBpcyBhcnJheS1saWtlXG4gIGVsc2VcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZpcnN0IGFyZ3VtZW50IG5lZWRzIHRvIGJlIGEgbnVtYmVyLCBhcnJheSBvciBzdHJpbmcuJylcblxuICB2YXIgYnVmXG4gIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgLy8gUHJlZmVycmVkOiBSZXR1cm4gYW4gYXVnbWVudGVkIGBVaW50OEFycmF5YCBpbnN0YW5jZSBmb3IgYmVzdCBwZXJmb3JtYW5jZVxuICAgIGJ1ZiA9IEJ1ZmZlci5fYXVnbWVudChuZXcgVWludDhBcnJheShsZW5ndGgpKVxuICB9IGVsc2Uge1xuICAgIC8vIEZhbGxiYWNrOiBSZXR1cm4gVEhJUyBpbnN0YW5jZSBvZiBCdWZmZXIgKGNyZWF0ZWQgYnkgYG5ld2ApXG4gICAgYnVmID0gdGhpc1xuICAgIGJ1Zi5sZW5ndGggPSBsZW5ndGhcbiAgICBidWYuX2lzQnVmZmVyID0gdHJ1ZVxuICB9XG5cbiAgdmFyIGlcbiAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMgJiYgdHlwZW9mIHN1YmplY3QuYnl0ZUxlbmd0aCA9PT0gJ251bWJlcicpIHtcbiAgICAvLyBTcGVlZCBvcHRpbWl6YXRpb24gLS0gdXNlIHNldCBpZiB3ZSdyZSBjb3B5aW5nIGZyb20gYSB0eXBlZCBhcnJheVxuICAgIGJ1Zi5fc2V0KHN1YmplY3QpXG4gIH0gZWxzZSBpZiAoaXNBcnJheWlzaChzdWJqZWN0KSkge1xuICAgIC8vIFRyZWF0IGFycmF5LWlzaCBvYmplY3RzIGFzIGEgYnl0ZSBhcnJheVxuICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgaWYgKEJ1ZmZlci5pc0J1ZmZlcihzdWJqZWN0KSlcbiAgICAgICAgYnVmW2ldID0gc3ViamVjdC5yZWFkVUludDgoaSlcbiAgICAgIGVsc2VcbiAgICAgICAgYnVmW2ldID0gc3ViamVjdFtpXVxuICAgIH1cbiAgfSBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJykge1xuICAgIGJ1Zi53cml0ZShzdWJqZWN0LCAwLCBlbmNvZGluZylcbiAgfSBlbHNlIGlmICh0eXBlID09PSAnbnVtYmVyJyAmJiAhQnVmZmVyLl91c2VUeXBlZEFycmF5cyAmJiAhbm9aZXJvKSB7XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBidWZbaV0gPSAwXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGJ1ZlxufVxuXG4vLyBTVEFUSUMgTUVUSE9EU1xuLy8gPT09PT09PT09PT09PT1cblxuQnVmZmVyLmlzRW5jb2RpbmcgPSBmdW5jdGlvbiAoZW5jb2RpbmcpIHtcbiAgc3dpdGNoIChTdHJpbmcoZW5jb2RpbmcpLnRvTG93ZXJDYXNlKCkpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgIGNhc2UgJ3Jhdyc6XG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldHVybiB0cnVlXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBmYWxzZVxuICB9XG59XG5cbkJ1ZmZlci5pc0J1ZmZlciA9IGZ1bmN0aW9uIChiKSB7XG4gIHJldHVybiAhIShiICE9PSBudWxsICYmIGIgIT09IHVuZGVmaW5lZCAmJiBiLl9pc0J1ZmZlcilcbn1cblxuQnVmZmVyLmJ5dGVMZW5ndGggPSBmdW5jdGlvbiAoc3RyLCBlbmNvZGluZykge1xuICB2YXIgcmV0XG4gIHN0ciA9IHN0ciArICcnXG4gIHN3aXRjaCAoZW5jb2RpbmcgfHwgJ3V0ZjgnKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGggLyAyXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgIHJldCA9IHV0ZjhUb0J5dGVzKHN0cikubGVuZ3RoXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ3Jhdyc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXQgPSBiYXNlNjRUb0J5dGVzKHN0cikubGVuZ3RoXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoICogMlxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVuY29kaW5nJylcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbkJ1ZmZlci5jb25jYXQgPSBmdW5jdGlvbiAobGlzdCwgdG90YWxMZW5ndGgpIHtcbiAgYXNzZXJ0KGlzQXJyYXkobGlzdCksICdVc2FnZTogQnVmZmVyLmNvbmNhdChsaXN0LCBbdG90YWxMZW5ndGhdKVxcbicgK1xuICAgICAgJ2xpc3Qgc2hvdWxkIGJlIGFuIEFycmF5LicpXG5cbiAgaWYgKGxpc3QubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoMClcbiAgfSBlbHNlIGlmIChsaXN0Lmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBsaXN0WzBdXG4gIH1cblxuICB2YXIgaVxuICBpZiAodHlwZW9mIHRvdGFsTGVuZ3RoICE9PSAnbnVtYmVyJykge1xuICAgIHRvdGFsTGVuZ3RoID0gMFxuICAgIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICB0b3RhbExlbmd0aCArPSBsaXN0W2ldLmxlbmd0aFxuICAgIH1cbiAgfVxuXG4gIHZhciBidWYgPSBuZXcgQnVmZmVyKHRvdGFsTGVuZ3RoKVxuICB2YXIgcG9zID0gMFxuICBmb3IgKGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgIHZhciBpdGVtID0gbGlzdFtpXVxuICAgIGl0ZW0uY29weShidWYsIHBvcylcbiAgICBwb3MgKz0gaXRlbS5sZW5ndGhcbiAgfVxuICByZXR1cm4gYnVmXG59XG5cbi8vIEJVRkZFUiBJTlNUQU5DRSBNRVRIT0RTXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiBfaGV4V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICBvZmZzZXQgPSBOdW1iZXIob2Zmc2V0KSB8fCAwXG4gIHZhciByZW1haW5pbmcgPSBidWYubGVuZ3RoIC0gb2Zmc2V0XG4gIGlmICghbGVuZ3RoKSB7XG4gICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gIH0gZWxzZSB7XG4gICAgbGVuZ3RoID0gTnVtYmVyKGxlbmd0aClcbiAgICBpZiAobGVuZ3RoID4gcmVtYWluaW5nKSB7XG4gICAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgICB9XG4gIH1cblxuICAvLyBtdXN0IGJlIGFuIGV2ZW4gbnVtYmVyIG9mIGRpZ2l0c1xuICB2YXIgc3RyTGVuID0gc3RyaW5nLmxlbmd0aFxuICBhc3NlcnQoc3RyTGVuICUgMiA9PT0gMCwgJ0ludmFsaWQgaGV4IHN0cmluZycpXG5cbiAgaWYgKGxlbmd0aCA+IHN0ckxlbiAvIDIpIHtcbiAgICBsZW5ndGggPSBzdHJMZW4gLyAyXG4gIH1cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIHZhciBieXRlID0gcGFyc2VJbnQoc3RyaW5nLnN1YnN0cihpICogMiwgMiksIDE2KVxuICAgIGFzc2VydCghaXNOYU4oYnl0ZSksICdJbnZhbGlkIGhleCBzdHJpbmcnKVxuICAgIGJ1ZltvZmZzZXQgKyBpXSA9IGJ5dGVcbiAgfVxuICBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9IGkgKiAyXG4gIHJldHVybiBpXG59XG5cbmZ1bmN0aW9uIF91dGY4V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPVxuICAgIGJsaXRCdWZmZXIodXRmOFRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5mdW5jdGlvbiBfYXNjaWlXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcihhc2NpaVRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5mdW5jdGlvbiBfYmluYXJ5V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICByZXR1cm4gX2FzY2lpV3JpdGUoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxufVxuXG5mdW5jdGlvbiBfYmFzZTY0V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPVxuICAgIGJsaXRCdWZmZXIoYmFzZTY0VG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIF91dGYxNmxlV3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPVxuICAgIGJsaXRCdWZmZXIodXRmMTZsZVRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlID0gZnVuY3Rpb24gKHN0cmluZywgb2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nKSB7XG4gIC8vIFN1cHBvcnQgYm90aCAoc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCwgZW5jb2RpbmcpXG4gIC8vIGFuZCB0aGUgbGVnYWN5IChzdHJpbmcsIGVuY29kaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgaWYgKGlzRmluaXRlKG9mZnNldCkpIHtcbiAgICBpZiAoIWlzRmluaXRlKGxlbmd0aCkpIHtcbiAgICAgIGVuY29kaW5nID0gbGVuZ3RoXG4gICAgICBsZW5ndGggPSB1bmRlZmluZWRcbiAgICB9XG4gIH0gZWxzZSB7ICAvLyBsZWdhY3lcbiAgICB2YXIgc3dhcCA9IGVuY29kaW5nXG4gICAgZW5jb2RpbmcgPSBvZmZzZXRcbiAgICBvZmZzZXQgPSBsZW5ndGhcbiAgICBsZW5ndGggPSBzd2FwXG4gIH1cblxuICBvZmZzZXQgPSBOdW1iZXIob2Zmc2V0KSB8fCAwXG4gIHZhciByZW1haW5pbmcgPSB0aGlzLmxlbmd0aCAtIG9mZnNldFxuICBpZiAoIWxlbmd0aCkge1xuICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICB9IGVsc2Uge1xuICAgIGxlbmd0aCA9IE51bWJlcihsZW5ndGgpXG4gICAgaWYgKGxlbmd0aCA+IHJlbWFpbmluZykge1xuICAgICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gICAgfVxuICB9XG4gIGVuY29kaW5nID0gU3RyaW5nKGVuY29kaW5nIHx8ICd1dGY4JykudG9Mb3dlckNhc2UoKVxuXG4gIHZhciByZXRcbiAgc3dpdGNoIChlbmNvZGluZykge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgICByZXQgPSBfaGV4V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gX3V0ZjhXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgICByZXQgPSBfYXNjaWlXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiaW5hcnknOlxuICAgICAgcmV0ID0gX2JpbmFyeVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXQgPSBfYmFzZTY0V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldCA9IF91dGYxNmxlV3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbmNvZGluZycpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gKGVuY29kaW5nLCBzdGFydCwgZW5kKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuXG4gIGVuY29kaW5nID0gU3RyaW5nKGVuY29kaW5nIHx8ICd1dGY4JykudG9Mb3dlckNhc2UoKVxuICBzdGFydCA9IE51bWJlcihzdGFydCkgfHwgMFxuICBlbmQgPSAoZW5kICE9PSB1bmRlZmluZWQpXG4gICAgPyBOdW1iZXIoZW5kKVxuICAgIDogZW5kID0gc2VsZi5sZW5ndGhcblxuICAvLyBGYXN0cGF0aCBlbXB0eSBzdHJpbmdzXG4gIGlmIChlbmQgPT09IHN0YXJ0KVxuICAgIHJldHVybiAnJ1xuXG4gIHZhciByZXRcbiAgc3dpdGNoIChlbmNvZGluZykge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgICByZXQgPSBfaGV4U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gX3V0ZjhTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgICByZXQgPSBfYXNjaWlTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiaW5hcnknOlxuICAgICAgcmV0ID0gX2JpbmFyeVNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXQgPSBfYmFzZTY0U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldCA9IF91dGYxNmxlU2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbmNvZGluZycpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHtcbiAgICB0eXBlOiAnQnVmZmVyJyxcbiAgICBkYXRhOiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0aGlzLl9hcnIgfHwgdGhpcywgMClcbiAgfVxufVxuXG4vLyBjb3B5KHRhcmdldEJ1ZmZlciwgdGFyZ2V0U3RhcnQ9MCwgc291cmNlU3RhcnQ9MCwgc291cmNlRW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLmNvcHkgPSBmdW5jdGlvbiAodGFyZ2V0LCB0YXJnZXRfc3RhcnQsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHNvdXJjZSA9IHRoaXNcblxuICBpZiAoIXN0YXJ0KSBzdGFydCA9IDBcbiAgaWYgKCFlbmQgJiYgZW5kICE9PSAwKSBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAoIXRhcmdldF9zdGFydCkgdGFyZ2V0X3N0YXJ0ID0gMFxuXG4gIC8vIENvcHkgMCBieXRlczsgd2UncmUgZG9uZVxuICBpZiAoZW5kID09PSBzdGFydCkgcmV0dXJuXG4gIGlmICh0YXJnZXQubGVuZ3RoID09PSAwIHx8IHNvdXJjZS5sZW5ndGggPT09IDApIHJldHVyblxuXG4gIC8vIEZhdGFsIGVycm9yIGNvbmRpdGlvbnNcbiAgYXNzZXJ0KGVuZCA+PSBzdGFydCwgJ3NvdXJjZUVuZCA8IHNvdXJjZVN0YXJ0JylcbiAgYXNzZXJ0KHRhcmdldF9zdGFydCA+PSAwICYmIHRhcmdldF9zdGFydCA8IHRhcmdldC5sZW5ndGgsXG4gICAgICAndGFyZ2V0U3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGFzc2VydChzdGFydCA+PSAwICYmIHN0YXJ0IDwgc291cmNlLmxlbmd0aCwgJ3NvdXJjZVN0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBhc3NlcnQoZW5kID49IDAgJiYgZW5kIDw9IHNvdXJjZS5sZW5ndGgsICdzb3VyY2VFbmQgb3V0IG9mIGJvdW5kcycpXG5cbiAgLy8gQXJlIHdlIG9vYj9cbiAgaWYgKGVuZCA+IHRoaXMubGVuZ3RoKVxuICAgIGVuZCA9IHRoaXMubGVuZ3RoXG4gIGlmICh0YXJnZXQubGVuZ3RoIC0gdGFyZ2V0X3N0YXJ0IDwgZW5kIC0gc3RhcnQpXG4gICAgZW5kID0gdGFyZ2V0Lmxlbmd0aCAtIHRhcmdldF9zdGFydCArIHN0YXJ0XG5cbiAgdmFyIGxlbiA9IGVuZCAtIHN0YXJ0XG5cbiAgaWYgKGxlbiA8IDEwMCB8fCAhQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspXG4gICAgICB0YXJnZXRbaSArIHRhcmdldF9zdGFydF0gPSB0aGlzW2kgKyBzdGFydF1cbiAgfSBlbHNlIHtcbiAgICB0YXJnZXQuX3NldCh0aGlzLnN1YmFycmF5KHN0YXJ0LCBzdGFydCArIGxlbiksIHRhcmdldF9zdGFydClcbiAgfVxufVxuXG5mdW5jdGlvbiBfYmFzZTY0U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICBpZiAoc3RhcnQgPT09IDAgJiYgZW5kID09PSBidWYubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGJhc2U2NC5mcm9tQnl0ZUFycmF5KGJ1ZilcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmLnNsaWNlKHN0YXJ0LCBlbmQpKVxuICB9XG59XG5cbmZ1bmN0aW9uIF91dGY4U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmVzID0gJydcbiAgdmFyIHRtcCA9ICcnXG4gIGVuZCA9IE1hdGgubWluKGJ1Zi5sZW5ndGgsIGVuZClcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIGlmIChidWZbaV0gPD0gMHg3Rikge1xuICAgICAgcmVzICs9IGRlY29kZVV0ZjhDaGFyKHRtcCkgKyBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZltpXSlcbiAgICAgIHRtcCA9ICcnXG4gICAgfSBlbHNlIHtcbiAgICAgIHRtcCArPSAnJScgKyBidWZbaV0udG9TdHJpbmcoMTYpXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHJlcyArIGRlY29kZVV0ZjhDaGFyKHRtcClcbn1cblxuZnVuY3Rpb24gX2FzY2lpU2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmV0ID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKVxuICAgIHJldCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZltpXSlcbiAgcmV0dXJuIHJldFxufVxuXG5mdW5jdGlvbiBfYmluYXJ5U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICByZXR1cm4gX2FzY2lpU2xpY2UoYnVmLCBzdGFydCwgZW5kKVxufVxuXG5mdW5jdGlvbiBfaGV4U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuXG4gIGlmICghc3RhcnQgfHwgc3RhcnQgPCAwKSBzdGFydCA9IDBcbiAgaWYgKCFlbmQgfHwgZW5kIDwgMCB8fCBlbmQgPiBsZW4pIGVuZCA9IGxlblxuXG4gIHZhciBvdXQgPSAnJ1xuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIG91dCArPSB0b0hleChidWZbaV0pXG4gIH1cbiAgcmV0dXJuIG91dFxufVxuXG5mdW5jdGlvbiBfdXRmMTZsZVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGJ5dGVzID0gYnVmLnNsaWNlKHN0YXJ0LCBlbmQpXG4gIHZhciByZXMgPSAnJ1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGJ5dGVzLmxlbmd0aDsgaSArPSAyKSB7XG4gICAgcmVzICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnl0ZXNbaV0gKyBieXRlc1tpKzFdICogMjU2KVxuICB9XG4gIHJldHVybiByZXNcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5zbGljZSA9IGZ1bmN0aW9uIChzdGFydCwgZW5kKSB7XG4gIHZhciBsZW4gPSB0aGlzLmxlbmd0aFxuICBzdGFydCA9IGNsYW1wKHN0YXJ0LCBsZW4sIDApXG4gIGVuZCA9IGNsYW1wKGVuZCwgbGVuLCBsZW4pXG5cbiAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMpIHtcbiAgICByZXR1cm4gQnVmZmVyLl9hdWdtZW50KHRoaXMuc3ViYXJyYXkoc3RhcnQsIGVuZCkpXG4gIH0gZWxzZSB7XG4gICAgdmFyIHNsaWNlTGVuID0gZW5kIC0gc3RhcnRcbiAgICB2YXIgbmV3QnVmID0gbmV3IEJ1ZmZlcihzbGljZUxlbiwgdW5kZWZpbmVkLCB0cnVlKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2xpY2VMZW47IGkrKykge1xuICAgICAgbmV3QnVmW2ldID0gdGhpc1tpICsgc3RhcnRdXG4gICAgfVxuICAgIHJldHVybiBuZXdCdWZcbiAgfVxufVxuXG4vLyBgZ2V0YCB3aWxsIGJlIHJlbW92ZWQgaW4gTm9kZSAwLjEzK1xuQnVmZmVyLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAob2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuZ2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy5yZWFkVUludDgob2Zmc2V0KVxufVxuXG4vLyBgc2V0YCB3aWxsIGJlIHJlbW92ZWQgaW4gTm9kZSAwLjEzK1xuQnVmZmVyLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAodiwgb2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuc2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy53cml0ZVVJbnQ4KHYsIG9mZnNldClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDggPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKVxuICAgIHJldHVyblxuXG4gIHJldHVybiB0aGlzW29mZnNldF1cbn1cblxuZnVuY3Rpb24gX3JlYWRVSW50MTYgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsXG4gIGlmIChsaXR0bGVFbmRpYW4pIHtcbiAgICB2YWwgPSBidWZbb2Zmc2V0XVxuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAxXSA8PCA4XG4gIH0gZWxzZSB7XG4gICAgdmFsID0gYnVmW29mZnNldF0gPDwgOFxuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAxXVxuICB9XG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MTYodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MTYodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkVUludDMyIChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbFxuICBpZiAobGl0dGxlRW5kaWFuKSB7XG4gICAgaWYgKG9mZnNldCArIDIgPCBsZW4pXG4gICAgICB2YWwgPSBidWZbb2Zmc2V0ICsgMl0gPDwgMTZcbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMV0gPDwgOFxuICAgIHZhbCB8PSBidWZbb2Zmc2V0XVxuICAgIGlmIChvZmZzZXQgKyAzIDwgbGVuKVxuICAgICAgdmFsID0gdmFsICsgKGJ1ZltvZmZzZXQgKyAzXSA8PCAyNCA+Pj4gMClcbiAgfSBlbHNlIHtcbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCA9IGJ1ZltvZmZzZXQgKyAxXSA8PCAxNlxuICAgIGlmIChvZmZzZXQgKyAyIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAyXSA8PCA4XG4gICAgaWYgKG9mZnNldCArIDMgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDNdXG4gICAgdmFsID0gdmFsICsgKGJ1ZltvZmZzZXRdIDw8IDI0ID4+PiAwKVxuICB9XG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDMyTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MzIodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDMyQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MzIodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDggPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCxcbiAgICAgICAgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKVxuICAgIHJldHVyblxuXG4gIHZhciBuZWcgPSB0aGlzW29mZnNldF0gJiAweDgwXG4gIGlmIChuZWcpXG4gICAgcmV0dXJuICgweGZmIC0gdGhpc1tvZmZzZXRdICsgMSkgKiAtMVxuICBlbHNlXG4gICAgcmV0dXJuIHRoaXNbb2Zmc2V0XVxufVxuXG5mdW5jdGlvbiBfcmVhZEludDE2IChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbCA9IF9yZWFkVUludDE2KGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHRydWUpXG4gIHZhciBuZWcgPSB2YWwgJiAweDgwMDBcbiAgaWYgKG5lZylcbiAgICByZXR1cm4gKDB4ZmZmZiAtIHZhbCArIDEpICogLTFcbiAgZWxzZVxuICAgIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDE2KHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDE2QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQxNih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWRJbnQzMiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWwgPSBfcmVhZFVJbnQzMihidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCB0cnVlKVxuICB2YXIgbmVnID0gdmFsICYgMHg4MDAwMDAwMFxuICBpZiAobmVnKVxuICAgIHJldHVybiAoMHhmZmZmZmZmZiAtIHZhbCArIDEpICogLTFcbiAgZWxzZVxuICAgIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MzJMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDMyKHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQzMih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWRGbG9hdCAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICByZXR1cm4gaWVlZTc1NC5yZWFkKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDIzLCA0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRGbG9hdExFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRmxvYXQodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRmxvYXRCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEZsb2F0KHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZERvdWJsZSAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICsgNyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICByZXR1cm4gaWVlZTc1NC5yZWFkKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDUyLCA4KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWREb3VibGVMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZERvdWJsZSh0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWREb3VibGVCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZERvdWJsZSh0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQ4ID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAndHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnVpbnQodmFsdWUsIDB4ZmYpXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKSByZXR1cm5cblxuICB0aGlzW29mZnNldF0gPSB2YWx1ZVxufVxuXG5mdW5jdGlvbiBfd3JpdGVVSW50MTYgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICd0cnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmdWludCh2YWx1ZSwgMHhmZmZmKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgZm9yICh2YXIgaSA9IDAsIGogPSBNYXRoLm1pbihsZW4gLSBvZmZzZXQsIDIpOyBpIDwgajsgaSsrKSB7XG4gICAgYnVmW29mZnNldCArIGldID1cbiAgICAgICAgKHZhbHVlICYgKDB4ZmYgPDwgKDggKiAobGl0dGxlRW5kaWFuID8gaSA6IDEgLSBpKSkpKSA+Pj5cbiAgICAgICAgICAgIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpICogOFxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MTZMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MTZCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVVSW50MzIgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICd0cnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmdWludCh2YWx1ZSwgMHhmZmZmZmZmZilcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGZvciAodmFyIGkgPSAwLCBqID0gTWF0aC5taW4obGVuIC0gb2Zmc2V0LCA0KTsgaSA8IGo7IGkrKykge1xuICAgIGJ1ZltvZmZzZXQgKyBpXSA9XG4gICAgICAgICh2YWx1ZSA+Pj4gKGxpdHRsZUVuZGlhbiA/IGkgOiAzIC0gaSkgKiA4KSAmIDB4ZmZcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDMyTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDMyQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDggPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmc2ludCh2YWx1ZSwgMHg3ZiwgLTB4ODApXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKVxuICAgIHJldHVyblxuXG4gIGlmICh2YWx1ZSA+PSAwKVxuICAgIHRoaXMud3JpdGVVSW50OCh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydClcbiAgZWxzZVxuICAgIHRoaXMud3JpdGVVSW50OCgweGZmICsgdmFsdWUgKyAxLCBvZmZzZXQsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVJbnQxNiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZzaW50KHZhbHVlLCAweDdmZmYsIC0weDgwMDApXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZiAodmFsdWUgPj0gMClcbiAgICBfd3JpdGVVSW50MTYoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxuICBlbHNlXG4gICAgX3dyaXRlVUludDE2KGJ1ZiwgMHhmZmZmICsgdmFsdWUgKyAxLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQxNkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZUludDMyIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnNpbnQodmFsdWUsIDB4N2ZmZmZmZmYsIC0weDgwMDAwMDAwKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWYgKHZhbHVlID49IDApXG4gICAgX3dyaXRlVUludDMyKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbiAgZWxzZVxuICAgIF93cml0ZVVJbnQzMihidWYsIDB4ZmZmZmZmZmYgKyB2YWx1ZSArIDEsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQzMkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlRmxvYXQgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmSUVFRTc1NCh2YWx1ZSwgMy40MDI4MjM0NjYzODUyODg2ZSszOCwgLTMuNDAyODIzNDY2Mzg1Mjg4NmUrMzgpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCAyMywgNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUZsb2F0TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRmxvYXQodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdEJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUZsb2F0KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlRG91YmxlIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDcgPCBidWYubGVuZ3RoLFxuICAgICAgICAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZklFRUU3NTQodmFsdWUsIDEuNzk3NjkzMTM0ODYyMzE1N0UrMzA4LCAtMS43OTc2OTMxMzQ4NjIzMTU3RSszMDgpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCA1MiwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZURvdWJsZSh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZURvdWJsZSh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbi8vIGZpbGwodmFsdWUsIHN0YXJ0PTAsIGVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5maWxsID0gZnVuY3Rpb24gKHZhbHVlLCBzdGFydCwgZW5kKSB7XG4gIGlmICghdmFsdWUpIHZhbHVlID0gMFxuICBpZiAoIXN0YXJ0KSBzdGFydCA9IDBcbiAgaWYgKCFlbmQpIGVuZCA9IHRoaXMubGVuZ3RoXG5cbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICB2YWx1ZSA9IHZhbHVlLmNoYXJDb2RlQXQoMClcbiAgfVxuXG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmICFpc05hTih2YWx1ZSksICd2YWx1ZSBpcyBub3QgYSBudW1iZXInKVxuICBhc3NlcnQoZW5kID49IHN0YXJ0LCAnZW5kIDwgc3RhcnQnKVxuXG4gIC8vIEZpbGwgMCBieXRlczsgd2UncmUgZG9uZVxuICBpZiAoZW5kID09PSBzdGFydCkgcmV0dXJuXG4gIGlmICh0aGlzLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cbiAgYXNzZXJ0KHN0YXJ0ID49IDAgJiYgc3RhcnQgPCB0aGlzLmxlbmd0aCwgJ3N0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBhc3NlcnQoZW5kID49IDAgJiYgZW5kIDw9IHRoaXMubGVuZ3RoLCAnZW5kIG91dCBvZiBib3VuZHMnKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgdGhpc1tpXSA9IHZhbHVlXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS5pbnNwZWN0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgb3V0ID0gW11cbiAgdmFyIGxlbiA9IHRoaXMubGVuZ3RoXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICBvdXRbaV0gPSB0b0hleCh0aGlzW2ldKVxuICAgIGlmIChpID09PSBleHBvcnRzLklOU1BFQ1RfTUFYX0JZVEVTKSB7XG4gICAgICBvdXRbaSArIDFdID0gJy4uLidcbiAgICAgIGJyZWFrXG4gICAgfVxuICB9XG4gIHJldHVybiAnPEJ1ZmZlciAnICsgb3V0LmpvaW4oJyAnKSArICc+J1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgYEFycmF5QnVmZmVyYCB3aXRoIHRoZSAqY29waWVkKiBtZW1vcnkgb2YgdGhlIGJ1ZmZlciBpbnN0YW5jZS5cbiAqIEFkZGVkIGluIE5vZGUgMC4xMi4gT25seSBhdmFpbGFibGUgaW4gYnJvd3NlcnMgdGhhdCBzdXBwb3J0IEFycmF5QnVmZmVyLlxuICovXG5CdWZmZXIucHJvdG90eXBlLnRvQXJyYXlCdWZmZXIgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0eXBlb2YgVWludDhBcnJheSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgICAgcmV0dXJuIChuZXcgQnVmZmVyKHRoaXMpKS5idWZmZXJcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGJ1ZiA9IG5ldyBVaW50OEFycmF5KHRoaXMubGVuZ3RoKVxuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGJ1Zi5sZW5ndGg7IGkgPCBsZW47IGkgKz0gMSlcbiAgICAgICAgYnVmW2ldID0gdGhpc1tpXVxuICAgICAgcmV0dXJuIGJ1Zi5idWZmZXJcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdCdWZmZXIudG9BcnJheUJ1ZmZlciBub3Qgc3VwcG9ydGVkIGluIHRoaXMgYnJvd3NlcicpXG4gIH1cbn1cblxuLy8gSEVMUEVSIEZVTkNUSU9OU1xuLy8gPT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiBzdHJpbmd0cmltIChzdHIpIHtcbiAgaWYgKHN0ci50cmltKSByZXR1cm4gc3RyLnRyaW0oKVxuICByZXR1cm4gc3RyLnJlcGxhY2UoL15cXHMrfFxccyskL2csICcnKVxufVxuXG52YXIgQlAgPSBCdWZmZXIucHJvdG90eXBlXG5cbi8qKlxuICogQXVnbWVudCBhIFVpbnQ4QXJyYXkgKmluc3RhbmNlKiAobm90IHRoZSBVaW50OEFycmF5IGNsYXNzISkgd2l0aCBCdWZmZXIgbWV0aG9kc1xuICovXG5CdWZmZXIuX2F1Z21lbnQgPSBmdW5jdGlvbiAoYXJyKSB7XG4gIGFyci5faXNCdWZmZXIgPSB0cnVlXG5cbiAgLy8gc2F2ZSByZWZlcmVuY2UgdG8gb3JpZ2luYWwgVWludDhBcnJheSBnZXQvc2V0IG1ldGhvZHMgYmVmb3JlIG92ZXJ3cml0aW5nXG4gIGFyci5fZ2V0ID0gYXJyLmdldFxuICBhcnIuX3NldCA9IGFyci5zZXRcblxuICAvLyBkZXByZWNhdGVkLCB3aWxsIGJlIHJlbW92ZWQgaW4gbm9kZSAwLjEzK1xuICBhcnIuZ2V0ID0gQlAuZ2V0XG4gIGFyci5zZXQgPSBCUC5zZXRcblxuICBhcnIud3JpdGUgPSBCUC53cml0ZVxuICBhcnIudG9TdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9Mb2NhbGVTdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9KU09OID0gQlAudG9KU09OXG4gIGFyci5jb3B5ID0gQlAuY29weVxuICBhcnIuc2xpY2UgPSBCUC5zbGljZVxuICBhcnIucmVhZFVJbnQ4ID0gQlAucmVhZFVJbnQ4XG4gIGFyci5yZWFkVUludDE2TEUgPSBCUC5yZWFkVUludDE2TEVcbiAgYXJyLnJlYWRVSW50MTZCRSA9IEJQLnJlYWRVSW50MTZCRVxuICBhcnIucmVhZFVJbnQzMkxFID0gQlAucmVhZFVJbnQzMkxFXG4gIGFyci5yZWFkVUludDMyQkUgPSBCUC5yZWFkVUludDMyQkVcbiAgYXJyLnJlYWRJbnQ4ID0gQlAucmVhZEludDhcbiAgYXJyLnJlYWRJbnQxNkxFID0gQlAucmVhZEludDE2TEVcbiAgYXJyLnJlYWRJbnQxNkJFID0gQlAucmVhZEludDE2QkVcbiAgYXJyLnJlYWRJbnQzMkxFID0gQlAucmVhZEludDMyTEVcbiAgYXJyLnJlYWRJbnQzMkJFID0gQlAucmVhZEludDMyQkVcbiAgYXJyLnJlYWRGbG9hdExFID0gQlAucmVhZEZsb2F0TEVcbiAgYXJyLnJlYWRGbG9hdEJFID0gQlAucmVhZEZsb2F0QkVcbiAgYXJyLnJlYWREb3VibGVMRSA9IEJQLnJlYWREb3VibGVMRVxuICBhcnIucmVhZERvdWJsZUJFID0gQlAucmVhZERvdWJsZUJFXG4gIGFyci53cml0ZVVJbnQ4ID0gQlAud3JpdGVVSW50OFxuICBhcnIud3JpdGVVSW50MTZMRSA9IEJQLndyaXRlVUludDE2TEVcbiAgYXJyLndyaXRlVUludDE2QkUgPSBCUC53cml0ZVVJbnQxNkJFXG4gIGFyci53cml0ZVVJbnQzMkxFID0gQlAud3JpdGVVSW50MzJMRVxuICBhcnIud3JpdGVVSW50MzJCRSA9IEJQLndyaXRlVUludDMyQkVcbiAgYXJyLndyaXRlSW50OCA9IEJQLndyaXRlSW50OFxuICBhcnIud3JpdGVJbnQxNkxFID0gQlAud3JpdGVJbnQxNkxFXG4gIGFyci53cml0ZUludDE2QkUgPSBCUC53cml0ZUludDE2QkVcbiAgYXJyLndyaXRlSW50MzJMRSA9IEJQLndyaXRlSW50MzJMRVxuICBhcnIud3JpdGVJbnQzMkJFID0gQlAud3JpdGVJbnQzMkJFXG4gIGFyci53cml0ZUZsb2F0TEUgPSBCUC53cml0ZUZsb2F0TEVcbiAgYXJyLndyaXRlRmxvYXRCRSA9IEJQLndyaXRlRmxvYXRCRVxuICBhcnIud3JpdGVEb3VibGVMRSA9IEJQLndyaXRlRG91YmxlTEVcbiAgYXJyLndyaXRlRG91YmxlQkUgPSBCUC53cml0ZURvdWJsZUJFXG4gIGFyci5maWxsID0gQlAuZmlsbFxuICBhcnIuaW5zcGVjdCA9IEJQLmluc3BlY3RcbiAgYXJyLnRvQXJyYXlCdWZmZXIgPSBCUC50b0FycmF5QnVmZmVyXG5cbiAgcmV0dXJuIGFyclxufVxuXG4vLyBzbGljZShzdGFydCwgZW5kKVxuZnVuY3Rpb24gY2xhbXAgKGluZGV4LCBsZW4sIGRlZmF1bHRWYWx1ZSkge1xuICBpZiAodHlwZW9mIGluZGV4ICE9PSAnbnVtYmVyJykgcmV0dXJuIGRlZmF1bHRWYWx1ZVxuICBpbmRleCA9IH5+aW5kZXg7ICAvLyBDb2VyY2UgdG8gaW50ZWdlci5cbiAgaWYgKGluZGV4ID49IGxlbikgcmV0dXJuIGxlblxuICBpZiAoaW5kZXggPj0gMCkgcmV0dXJuIGluZGV4XG4gIGluZGV4ICs9IGxlblxuICBpZiAoaW5kZXggPj0gMCkgcmV0dXJuIGluZGV4XG4gIHJldHVybiAwXG59XG5cbmZ1bmN0aW9uIGNvZXJjZSAobGVuZ3RoKSB7XG4gIC8vIENvZXJjZSBsZW5ndGggdG8gYSBudW1iZXIgKHBvc3NpYmx5IE5hTiksIHJvdW5kIHVwXG4gIC8vIGluIGNhc2UgaXQncyBmcmFjdGlvbmFsIChlLmcuIDEyMy40NTYpIHRoZW4gZG8gYVxuICAvLyBkb3VibGUgbmVnYXRlIHRvIGNvZXJjZSBhIE5hTiB0byAwLiBFYXN5LCByaWdodD9cbiAgbGVuZ3RoID0gfn5NYXRoLmNlaWwoK2xlbmd0aClcbiAgcmV0dXJuIGxlbmd0aCA8IDAgPyAwIDogbGVuZ3RoXG59XG5cbmZ1bmN0aW9uIGlzQXJyYXkgKHN1YmplY3QpIHtcbiAgcmV0dXJuIChBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uIChzdWJqZWN0KSB7XG4gICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChzdWJqZWN0KSA9PT0gJ1tvYmplY3QgQXJyYXldJ1xuICB9KShzdWJqZWN0KVxufVxuXG5mdW5jdGlvbiBpc0FycmF5aXNoIChzdWJqZWN0KSB7XG4gIHJldHVybiBpc0FycmF5KHN1YmplY3QpIHx8IEJ1ZmZlci5pc0J1ZmZlcihzdWJqZWN0KSB8fFxuICAgICAgc3ViamVjdCAmJiB0eXBlb2Ygc3ViamVjdCA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHR5cGVvZiBzdWJqZWN0Lmxlbmd0aCA9PT0gJ251bWJlcidcbn1cblxuZnVuY3Rpb24gdG9IZXggKG4pIHtcbiAgaWYgKG4gPCAxNikgcmV0dXJuICcwJyArIG4udG9TdHJpbmcoMTYpXG4gIHJldHVybiBuLnRvU3RyaW5nKDE2KVxufVxuXG5mdW5jdGlvbiB1dGY4VG9CeXRlcyAoc3RyKSB7XG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIHZhciBiID0gc3RyLmNoYXJDb2RlQXQoaSlcbiAgICBpZiAoYiA8PSAweDdGKVxuICAgICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkpXG4gICAgZWxzZSB7XG4gICAgICB2YXIgc3RhcnQgPSBpXG4gICAgICBpZiAoYiA+PSAweEQ4MDAgJiYgYiA8PSAweERGRkYpIGkrK1xuICAgICAgdmFyIGggPSBlbmNvZGVVUklDb21wb25lbnQoc3RyLnNsaWNlKHN0YXJ0LCBpKzEpKS5zdWJzdHIoMSkuc3BsaXQoJyUnKVxuICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBoLmxlbmd0aDsgaisrKVxuICAgICAgICBieXRlQXJyYXkucHVzaChwYXJzZUludChoW2pdLCAxNikpXG4gICAgfVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gYXNjaWlUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgLy8gTm9kZSdzIGNvZGUgc2VlbXMgdG8gYmUgZG9pbmcgdGhpcyBhbmQgbm90ICYgMHg3Ri4uXG4gICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkgJiAweEZGKVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gdXRmMTZsZVRvQnl0ZXMgKHN0cikge1xuICB2YXIgYywgaGksIGxvXG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIGMgPSBzdHIuY2hhckNvZGVBdChpKVxuICAgIGhpID0gYyA+PiA4XG4gICAgbG8gPSBjICUgMjU2XG4gICAgYnl0ZUFycmF5LnB1c2gobG8pXG4gICAgYnl0ZUFycmF5LnB1c2goaGkpXG4gIH1cblxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIGJhc2U2NFRvQnl0ZXMgKHN0cikge1xuICByZXR1cm4gYmFzZTY0LnRvQnl0ZUFycmF5KHN0cilcbn1cblxuZnVuY3Rpb24gYmxpdEJ1ZmZlciAoc3JjLCBkc3QsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBwb3NcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmICgoaSArIG9mZnNldCA+PSBkc3QubGVuZ3RoKSB8fCAoaSA+PSBzcmMubGVuZ3RoKSlcbiAgICAgIGJyZWFrXG4gICAgZHN0W2kgKyBvZmZzZXRdID0gc3JjW2ldXG4gIH1cbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gZGVjb2RlVXRmOENoYXIgKHN0cikge1xuICB0cnkge1xuICAgIHJldHVybiBkZWNvZGVVUklDb21wb25lbnQoc3RyKVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZSgweEZGRkQpIC8vIFVURiA4IGludmFsaWQgY2hhclxuICB9XG59XG5cbi8qXG4gKiBXZSBoYXZlIHRvIG1ha2Ugc3VyZSB0aGF0IHRoZSB2YWx1ZSBpcyBhIHZhbGlkIGludGVnZXIuIFRoaXMgbWVhbnMgdGhhdCBpdFxuICogaXMgbm9uLW5lZ2F0aXZlLiBJdCBoYXMgbm8gZnJhY3Rpb25hbCBjb21wb25lbnQgYW5kIHRoYXQgaXQgZG9lcyBub3RcbiAqIGV4Y2VlZCB0aGUgbWF4aW11bSBhbGxvd2VkIHZhbHVlLlxuICovXG5mdW5jdGlvbiB2ZXJpZnVpbnQgKHZhbHVlLCBtYXgpIHtcbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicsICdjYW5ub3Qgd3JpdGUgYSBub24tbnVtYmVyIGFzIGEgbnVtYmVyJylcbiAgYXNzZXJ0KHZhbHVlID49IDAsICdzcGVjaWZpZWQgYSBuZWdhdGl2ZSB2YWx1ZSBmb3Igd3JpdGluZyBhbiB1bnNpZ25lZCB2YWx1ZScpXG4gIGFzc2VydCh2YWx1ZSA8PSBtYXgsICd2YWx1ZSBpcyBsYXJnZXIgdGhhbiBtYXhpbXVtIHZhbHVlIGZvciB0eXBlJylcbiAgYXNzZXJ0KE1hdGguZmxvb3IodmFsdWUpID09PSB2YWx1ZSwgJ3ZhbHVlIGhhcyBhIGZyYWN0aW9uYWwgY29tcG9uZW50Jylcbn1cblxuZnVuY3Rpb24gdmVyaWZzaW50ICh2YWx1ZSwgbWF4LCBtaW4pIHtcbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicsICdjYW5ub3Qgd3JpdGUgYSBub24tbnVtYmVyIGFzIGEgbnVtYmVyJylcbiAgYXNzZXJ0KHZhbHVlIDw9IG1heCwgJ3ZhbHVlIGxhcmdlciB0aGFuIG1heGltdW0gYWxsb3dlZCB2YWx1ZScpXG4gIGFzc2VydCh2YWx1ZSA+PSBtaW4sICd2YWx1ZSBzbWFsbGVyIHRoYW4gbWluaW11bSBhbGxvd2VkIHZhbHVlJylcbiAgYXNzZXJ0KE1hdGguZmxvb3IodmFsdWUpID09PSB2YWx1ZSwgJ3ZhbHVlIGhhcyBhIGZyYWN0aW9uYWwgY29tcG9uZW50Jylcbn1cblxuZnVuY3Rpb24gdmVyaWZJRUVFNzU0ICh2YWx1ZSwgbWF4LCBtaW4pIHtcbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicsICdjYW5ub3Qgd3JpdGUgYSBub24tbnVtYmVyIGFzIGEgbnVtYmVyJylcbiAgYXNzZXJ0KHZhbHVlIDw9IG1heCwgJ3ZhbHVlIGxhcmdlciB0aGFuIG1heGltdW0gYWxsb3dlZCB2YWx1ZScpXG4gIGFzc2VydCh2YWx1ZSA+PSBtaW4sICd2YWx1ZSBzbWFsbGVyIHRoYW4gbWluaW11bSBhbGxvd2VkIHZhbHVlJylcbn1cblxuZnVuY3Rpb24gYXNzZXJ0ICh0ZXN0LCBtZXNzYWdlKSB7XG4gIGlmICghdGVzdCkgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UgfHwgJ0ZhaWxlZCBhc3NlcnRpb24nKVxufVxuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9pbmRleC5qc1wiLFwiLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlclwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBsb29rdXAgPSAnQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLyc7XG5cbjsoZnVuY3Rpb24gKGV4cG9ydHMpIHtcblx0J3VzZSBzdHJpY3QnO1xuXG4gIHZhciBBcnIgPSAodHlwZW9mIFVpbnQ4QXJyYXkgIT09ICd1bmRlZmluZWQnKVxuICAgID8gVWludDhBcnJheVxuICAgIDogQXJyYXlcblxuXHR2YXIgUExVUyAgID0gJysnLmNoYXJDb2RlQXQoMClcblx0dmFyIFNMQVNIICA9ICcvJy5jaGFyQ29kZUF0KDApXG5cdHZhciBOVU1CRVIgPSAnMCcuY2hhckNvZGVBdCgwKVxuXHR2YXIgTE9XRVIgID0gJ2EnLmNoYXJDb2RlQXQoMClcblx0dmFyIFVQUEVSICA9ICdBJy5jaGFyQ29kZUF0KDApXG5cblx0ZnVuY3Rpb24gZGVjb2RlIChlbHQpIHtcblx0XHR2YXIgY29kZSA9IGVsdC5jaGFyQ29kZUF0KDApXG5cdFx0aWYgKGNvZGUgPT09IFBMVVMpXG5cdFx0XHRyZXR1cm4gNjIgLy8gJysnXG5cdFx0aWYgKGNvZGUgPT09IFNMQVNIKVxuXHRcdFx0cmV0dXJuIDYzIC8vICcvJ1xuXHRcdGlmIChjb2RlIDwgTlVNQkVSKVxuXHRcdFx0cmV0dXJuIC0xIC8vbm8gbWF0Y2hcblx0XHRpZiAoY29kZSA8IE5VTUJFUiArIDEwKVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBOVU1CRVIgKyAyNiArIDI2XG5cdFx0aWYgKGNvZGUgPCBVUFBFUiArIDI2KVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBVUFBFUlxuXHRcdGlmIChjb2RlIDwgTE9XRVIgKyAyNilcblx0XHRcdHJldHVybiBjb2RlIC0gTE9XRVIgKyAyNlxuXHR9XG5cblx0ZnVuY3Rpb24gYjY0VG9CeXRlQXJyYXkgKGI2NCkge1xuXHRcdHZhciBpLCBqLCBsLCB0bXAsIHBsYWNlSG9sZGVycywgYXJyXG5cblx0XHRpZiAoYjY0Lmxlbmd0aCAlIDQgPiAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgc3RyaW5nLiBMZW5ndGggbXVzdCBiZSBhIG11bHRpcGxlIG9mIDQnKVxuXHRcdH1cblxuXHRcdC8vIHRoZSBudW1iZXIgb2YgZXF1YWwgc2lnbnMgKHBsYWNlIGhvbGRlcnMpXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHR3byBwbGFjZWhvbGRlcnMsIHRoYW4gdGhlIHR3byBjaGFyYWN0ZXJzIGJlZm9yZSBpdFxuXHRcdC8vIHJlcHJlc2VudCBvbmUgYnl0ZVxuXHRcdC8vIGlmIHRoZXJlIGlzIG9ubHkgb25lLCB0aGVuIHRoZSB0aHJlZSBjaGFyYWN0ZXJzIGJlZm9yZSBpdCByZXByZXNlbnQgMiBieXRlc1xuXHRcdC8vIHRoaXMgaXMganVzdCBhIGNoZWFwIGhhY2sgdG8gbm90IGRvIGluZGV4T2YgdHdpY2Vcblx0XHR2YXIgbGVuID0gYjY0Lmxlbmd0aFxuXHRcdHBsYWNlSG9sZGVycyA9ICc9JyA9PT0gYjY0LmNoYXJBdChsZW4gLSAyKSA/IDIgOiAnPScgPT09IGI2NC5jaGFyQXQobGVuIC0gMSkgPyAxIDogMFxuXG5cdFx0Ly8gYmFzZTY0IGlzIDQvMyArIHVwIHRvIHR3byBjaGFyYWN0ZXJzIG9mIHRoZSBvcmlnaW5hbCBkYXRhXG5cdFx0YXJyID0gbmV3IEFycihiNjQubGVuZ3RoICogMyAvIDQgLSBwbGFjZUhvbGRlcnMpXG5cblx0XHQvLyBpZiB0aGVyZSBhcmUgcGxhY2Vob2xkZXJzLCBvbmx5IGdldCB1cCB0byB0aGUgbGFzdCBjb21wbGV0ZSA0IGNoYXJzXG5cdFx0bCA9IHBsYWNlSG9sZGVycyA+IDAgPyBiNjQubGVuZ3RoIC0gNCA6IGI2NC5sZW5ndGhcblxuXHRcdHZhciBMID0gMFxuXG5cdFx0ZnVuY3Rpb24gcHVzaCAodikge1xuXHRcdFx0YXJyW0wrK10gPSB2XG5cdFx0fVxuXG5cdFx0Zm9yIChpID0gMCwgaiA9IDA7IGkgPCBsOyBpICs9IDQsIGogKz0gMykge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAxOCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA8PCAxMikgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDIpKSA8PCA2KSB8IGRlY29kZShiNjQuY2hhckF0KGkgKyAzKSlcblx0XHRcdHB1c2goKHRtcCAmIDB4RkYwMDAwKSA+PiAxNilcblx0XHRcdHB1c2goKHRtcCAmIDB4RkYwMCkgPj4gOClcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9XG5cblx0XHRpZiAocGxhY2VIb2xkZXJzID09PSAyKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDIpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPj4gNClcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9IGVsc2UgaWYgKHBsYWNlSG9sZGVycyA9PT0gMSkge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAxMCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA8PCA0KSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMikpID4+IDIpXG5cdFx0XHRwdXNoKCh0bXAgPj4gOCkgJiAweEZGKVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH1cblxuXHRcdHJldHVybiBhcnJcblx0fVxuXG5cdGZ1bmN0aW9uIHVpbnQ4VG9CYXNlNjQgKHVpbnQ4KSB7XG5cdFx0dmFyIGksXG5cdFx0XHRleHRyYUJ5dGVzID0gdWludDgubGVuZ3RoICUgMywgLy8gaWYgd2UgaGF2ZSAxIGJ5dGUgbGVmdCwgcGFkIDIgYnl0ZXNcblx0XHRcdG91dHB1dCA9IFwiXCIsXG5cdFx0XHR0ZW1wLCBsZW5ndGhcblxuXHRcdGZ1bmN0aW9uIGVuY29kZSAobnVtKSB7XG5cdFx0XHRyZXR1cm4gbG9va3VwLmNoYXJBdChudW0pXG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gdHJpcGxldFRvQmFzZTY0IChudW0pIHtcblx0XHRcdHJldHVybiBlbmNvZGUobnVtID4+IDE4ICYgMHgzRikgKyBlbmNvZGUobnVtID4+IDEyICYgMHgzRikgKyBlbmNvZGUobnVtID4+IDYgJiAweDNGKSArIGVuY29kZShudW0gJiAweDNGKVxuXHRcdH1cblxuXHRcdC8vIGdvIHRocm91Z2ggdGhlIGFycmF5IGV2ZXJ5IHRocmVlIGJ5dGVzLCB3ZSdsbCBkZWFsIHdpdGggdHJhaWxpbmcgc3R1ZmYgbGF0ZXJcblx0XHRmb3IgKGkgPSAwLCBsZW5ndGggPSB1aW50OC5sZW5ndGggLSBleHRyYUJ5dGVzOyBpIDwgbGVuZ3RoOyBpICs9IDMpIHtcblx0XHRcdHRlbXAgPSAodWludDhbaV0gPDwgMTYpICsgKHVpbnQ4W2kgKyAxXSA8PCA4KSArICh1aW50OFtpICsgMl0pXG5cdFx0XHRvdXRwdXQgKz0gdHJpcGxldFRvQmFzZTY0KHRlbXApXG5cdFx0fVxuXG5cdFx0Ly8gcGFkIHRoZSBlbmQgd2l0aCB6ZXJvcywgYnV0IG1ha2Ugc3VyZSB0byBub3QgZm9yZ2V0IHRoZSBleHRyYSBieXRlc1xuXHRcdHN3aXRjaCAoZXh0cmFCeXRlcykge1xuXHRcdFx0Y2FzZSAxOlxuXHRcdFx0XHR0ZW1wID0gdWludDhbdWludDgubGVuZ3RoIC0gMV1cblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSh0ZW1wID4+IDIpXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPDwgNCkgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gJz09J1xuXHRcdFx0XHRicmVha1xuXHRcdFx0Y2FzZSAyOlxuXHRcdFx0XHR0ZW1wID0gKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDJdIDw8IDgpICsgKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDFdKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKHRlbXAgPj4gMTApXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPj4gNCkgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wIDw8IDIpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9ICc9J1xuXHRcdFx0XHRicmVha1xuXHRcdH1cblxuXHRcdHJldHVybiBvdXRwdXRcblx0fVxuXG5cdGV4cG9ydHMudG9CeXRlQXJyYXkgPSBiNjRUb0J5dGVBcnJheVxuXHRleHBvcnRzLmZyb21CeXRlQXJyYXkgPSB1aW50OFRvQmFzZTY0XG59KHR5cGVvZiBleHBvcnRzID09PSAndW5kZWZpbmVkJyA/ICh0aGlzLmJhc2U2NGpzID0ge30pIDogZXhwb3J0cykpXG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL25vZGVfbW9kdWxlcy9iYXNlNjQtanMvbGliL2I2NC5qc1wiLFwiLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvYmFzZTY0LWpzL2xpYlwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbmV4cG9ydHMucmVhZCA9IGZ1bmN0aW9uKGJ1ZmZlciwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG0sXG4gICAgICBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxLFxuICAgICAgZU1heCA9ICgxIDw8IGVMZW4pIC0gMSxcbiAgICAgIGVCaWFzID0gZU1heCA+PiAxLFxuICAgICAgbkJpdHMgPSAtNyxcbiAgICAgIGkgPSBpc0xFID8gKG5CeXRlcyAtIDEpIDogMCxcbiAgICAgIGQgPSBpc0xFID8gLTEgOiAxLFxuICAgICAgcyA9IGJ1ZmZlcltvZmZzZXQgKyBpXTtcblxuICBpICs9IGQ7XG5cbiAgZSA9IHMgJiAoKDEgPDwgKC1uQml0cykpIC0gMSk7XG4gIHMgPj49ICgtbkJpdHMpO1xuICBuQml0cyArPSBlTGVuO1xuICBmb3IgKDsgbkJpdHMgPiAwOyBlID0gZSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KTtcblxuICBtID0gZSAmICgoMSA8PCAoLW5CaXRzKSkgLSAxKTtcbiAgZSA+Pj0gKC1uQml0cyk7XG4gIG5CaXRzICs9IG1MZW47XG4gIGZvciAoOyBuQml0cyA+IDA7IG0gPSBtICogMjU2ICsgYnVmZmVyW29mZnNldCArIGldLCBpICs9IGQsIG5CaXRzIC09IDgpO1xuXG4gIGlmIChlID09PSAwKSB7XG4gICAgZSA9IDEgLSBlQmlhcztcbiAgfSBlbHNlIGlmIChlID09PSBlTWF4KSB7XG4gICAgcmV0dXJuIG0gPyBOYU4gOiAoKHMgPyAtMSA6IDEpICogSW5maW5pdHkpO1xuICB9IGVsc2Uge1xuICAgIG0gPSBtICsgTWF0aC5wb3coMiwgbUxlbik7XG4gICAgZSA9IGUgLSBlQmlhcztcbiAgfVxuICByZXR1cm4gKHMgPyAtMSA6IDEpICogbSAqIE1hdGgucG93KDIsIGUgLSBtTGVuKTtcbn07XG5cbmV4cG9ydHMud3JpdGUgPSBmdW5jdGlvbihidWZmZXIsIHZhbHVlLCBvZmZzZXQsIGlzTEUsIG1MZW4sIG5CeXRlcykge1xuICB2YXIgZSwgbSwgYyxcbiAgICAgIGVMZW4gPSBuQnl0ZXMgKiA4IC0gbUxlbiAtIDEsXG4gICAgICBlTWF4ID0gKDEgPDwgZUxlbikgLSAxLFxuICAgICAgZUJpYXMgPSBlTWF4ID4+IDEsXG4gICAgICBydCA9IChtTGVuID09PSAyMyA/IE1hdGgucG93KDIsIC0yNCkgLSBNYXRoLnBvdygyLCAtNzcpIDogMCksXG4gICAgICBpID0gaXNMRSA/IDAgOiAobkJ5dGVzIC0gMSksXG4gICAgICBkID0gaXNMRSA/IDEgOiAtMSxcbiAgICAgIHMgPSB2YWx1ZSA8IDAgfHwgKHZhbHVlID09PSAwICYmIDEgLyB2YWx1ZSA8IDApID8gMSA6IDA7XG5cbiAgdmFsdWUgPSBNYXRoLmFicyh2YWx1ZSk7XG5cbiAgaWYgKGlzTmFOKHZhbHVlKSB8fCB2YWx1ZSA9PT0gSW5maW5pdHkpIHtcbiAgICBtID0gaXNOYU4odmFsdWUpID8gMSA6IDA7XG4gICAgZSA9IGVNYXg7XG4gIH0gZWxzZSB7XG4gICAgZSA9IE1hdGguZmxvb3IoTWF0aC5sb2codmFsdWUpIC8gTWF0aC5MTjIpO1xuICAgIGlmICh2YWx1ZSAqIChjID0gTWF0aC5wb3coMiwgLWUpKSA8IDEpIHtcbiAgICAgIGUtLTtcbiAgICAgIGMgKj0gMjtcbiAgICB9XG4gICAgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICB2YWx1ZSArPSBydCAvIGM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhbHVlICs9IHJ0ICogTWF0aC5wb3coMiwgMSAtIGVCaWFzKTtcbiAgICB9XG4gICAgaWYgKHZhbHVlICogYyA+PSAyKSB7XG4gICAgICBlKys7XG4gICAgICBjIC89IDI7XG4gICAgfVxuXG4gICAgaWYgKGUgKyBlQmlhcyA+PSBlTWF4KSB7XG4gICAgICBtID0gMDtcbiAgICAgIGUgPSBlTWF4O1xuICAgIH0gZWxzZSBpZiAoZSArIGVCaWFzID49IDEpIHtcbiAgICAgIG0gPSAodmFsdWUgKiBjIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICAgIGUgPSBlICsgZUJpYXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIG0gPSB2YWx1ZSAqIE1hdGgucG93KDIsIGVCaWFzIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICAgIGUgPSAwO1xuICAgIH1cbiAgfVxuXG4gIGZvciAoOyBtTGVuID49IDg7IGJ1ZmZlcltvZmZzZXQgKyBpXSA9IG0gJiAweGZmLCBpICs9IGQsIG0gLz0gMjU2LCBtTGVuIC09IDgpO1xuXG4gIGUgPSAoZSA8PCBtTGVuKSB8IG07XG4gIGVMZW4gKz0gbUxlbjtcbiAgZm9yICg7IGVMZW4gPiAwOyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBlICYgMHhmZiwgaSArPSBkLCBlIC89IDI1NiwgZUxlbiAtPSA4KTtcblxuICBidWZmZXJbb2Zmc2V0ICsgaSAtIGRdIHw9IHMgKiAxMjg7XG59O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvaWVlZTc1NC9pbmRleC5qc1wiLFwiLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvaWVlZTc1NFwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbnByb2Nlc3MubmV4dFRpY2sgPSAoZnVuY3Rpb24gKCkge1xuICAgIHZhciBjYW5TZXRJbW1lZGlhdGUgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJ1xuICAgICYmIHdpbmRvdy5zZXRJbW1lZGlhdGU7XG4gICAgdmFyIGNhblBvc3QgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJ1xuICAgICYmIHdpbmRvdy5wb3N0TWVzc2FnZSAmJiB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lclxuICAgIDtcblxuICAgIGlmIChjYW5TZXRJbW1lZGlhdGUpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmKSB7IHJldHVybiB3aW5kb3cuc2V0SW1tZWRpYXRlKGYpIH07XG4gICAgfVxuXG4gICAgaWYgKGNhblBvc3QpIHtcbiAgICAgICAgdmFyIHF1ZXVlID0gW107XG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgZnVuY3Rpb24gKGV2KSB7XG4gICAgICAgICAgICB2YXIgc291cmNlID0gZXYuc291cmNlO1xuICAgICAgICAgICAgaWYgKChzb3VyY2UgPT09IHdpbmRvdyB8fCBzb3VyY2UgPT09IG51bGwpICYmIGV2LmRhdGEgPT09ICdwcm9jZXNzLXRpY2snKSB7XG4gICAgICAgICAgICAgICAgZXYuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgaWYgKHF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZuID0gcXVldWUuc2hpZnQoKTtcbiAgICAgICAgICAgICAgICAgICAgZm4oKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgIHJldHVybiBmdW5jdGlvbiBuZXh0VGljayhmbikge1xuICAgICAgICAgICAgcXVldWUucHVzaChmbik7XG4gICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2UoJ3Byb2Nlc3MtdGljaycsICcqJyk7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uIG5leHRUaWNrKGZuKSB7XG4gICAgICAgIHNldFRpbWVvdXQoZm4sIDApO1xuICAgIH07XG59KSgpO1xuXG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn1cblxuLy8gVE9ETyhzaHR5bG1hbilcbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qc1wiLFwiLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3Byb2Nlc3NcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgaXNJbnN0YW5jZU9mID0gcmVxdWlyZSgnLi9sYW5nL2NvbW1vbi9pc0luc3RhbmNlT2YuanMnKS5pc0luc3RhbmNlT2Y7XG5cbmZ1bmN0aW9uIEFueSgpIHtcbn1cblxuQW55LnByb3RvdHlwZSA9IHtcbiAgbmFtZTogJ0FueScsXG5cbiAgX19BbnlfXzogdHJ1ZSxcblxuICBpc0luc3RhbmNlT2Y6IGZ1bmN0aW9uIChjbGFzc0xpa2UpIHtcbiAgICByZXR1cm4gaXNJbnN0YW5jZU9mKHRoaXMsIGNsYXNzTGlrZSk7XG4gIH0sXG5cbiAgZ2V0Q2xhc3M6IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5fX25hbWVfXztcbiAgfVxufTtcblxuZXhwb3J0cy5BbnkgID0gQW55O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL0FueS5qc1wiLFwiL1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBUcmFpdCA9IHJlcXVpcmUoJy4vbGFuZy9UcmFpdC5qcycpLlRyYWl0O1xuXG52YXIgRXF1YWxzID0gVHJhaXQoXCJFcXVhbHNcIikuYm9keSh7XG4gIGNhbkVxdWFsOiBUcmFpdC5yZXF1aXJlZCxcbiAgZXF1YWxzOiBUcmFpdC5yZXF1aXJlZFxufSk7XG5cbmV4cG9ydHMuRXF1YWxzID0gRXF1YWxzO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL0VxdWFscy5qc1wiLFwiL1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBzID0gcmVxdWlyZSgnLi9nbG9iYWwuanMnKS5zO1xuXG52YXIgbGFuZyA9IHJlcXVpcmUoJy4vbGFuZy5qcycpO1xudmFyIENsYXNzID0gbGFuZy5DbGFzcztcbnZhciBDYXNlQ2xhc3MgPSBsYW5nLkNhc2VDbGFzcztcbnZhciBDYXNlU2luZ2xldG9uID0gbGFuZy5DYXNlU2luZ2xldG9uO1xudmFyIFRyYWl0ID0gbGFuZy5UcmFpdDtcblxudmFyIGNvbW1vbiA9IHJlcXVpcmUoJy4vbGFuZy9jb21tb24uanMnKTtcbnZhciByZXN1bHQgPSBjb21tb24ucmVzdWx0O1xudmFyIGVxdWFscyA9IGNvbW1vbi5lcXVhbHM7XG5cbnZhciBOb1N1Y2hFbGVtZW50RXhjZXB0aW9uID0gcmVxdWlyZSgnLi9sYW5nL2V4Y2VwdGlvbi5qcycpLk5vU3VjaEVsZW1lbnRFeGNlcHRpb247XG5cbnZhciBPcHRpb24gPSBUcmFpdChmdW5jdGlvbiBPcHRpb24oeCkge1xuICBpZiAoeCA9PT0gbnVsbCB8fCB4ID09PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gTm9uZTtcbiAgfVxuICBlbHNlIHtcbiAgICByZXR1cm4gU29tZSh4KTtcbiAgfVxufSkuYm9keSh7XG5cbiAgaXNFbXB0eTogVHJhaXQucmVxdWlyZWQsXG5cbiAgaXNEZWZpbmVkOiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuICF0aGlzLmlzRW1wdHkoKTtcbiAgfSxcblxuICAvLyBUT0RPOiBSZW5hbWUgdG8gYXZvaWQgSlMgT2JqZWN0IGNvbmZsaWN0P1xuICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJUT0RPOiBOb3RJbXBsZW1lbnRlZEVycm9yXCIpO1xuICB9LFxuXG4gIGdldE9yRWxzZTogZnVuY3Rpb24gKGRlZiwgY29udGV4dCkge1xuICAgIGlmICh0aGlzLmlzRW1wdHkoKSkge1xuICAgICAgcmV0dXJuIHJlc3VsdChkZWYsIGNvbnRleHQpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdGhpcy5nZXQoKTtcbiAgICB9XG4gIH0sXG5cbiAgb3JOdWxsOiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0T3JFbHNlKG51bGwpO1xuICB9LFxuXG4gIG1hcDogZnVuY3Rpb24gKGYsIGNvbnRleHQpIHtcbiAgICBpZiAodGhpcy5pc0VtcHR5KCkpIHtcbiAgICAgIHJldHVybiBOb25lO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gU29tZShmLmNhbGwoY29udGV4dCwgdGhpcy5nZXQoKSkpO1xuICAgIH1cbiAgfSxcbiAgXG4gIC8vIFRPRE86IGZvbGQgb3IgcmVkdWNlP1xuICBmb2xkOiBmdW5jdGlvbiAoaWZFbXB0eSwgY29udGV4dElmRW1wdHkpIHtcbiAgICAvLyBUT0RPOiBCZXR0ZXIgd2F5IHRvIGRvY3VtZW50IHRoaXMgLyBiZXR0ZXIgd2F5IGZvciBwYXJ0aWFsIGFwcGxpY2F0aW9uP1xuICAgIHJldHVybiBmdW5jdGlvbiAoZiwgY29udGV4dCkge1xuICAgICAgaWYgKHRoaXMuaXNFbXB0eSgpKSB7XG4gICAgICAgIHJldHVybiByZXN1bHQoaWZFbXB0eSwgY29udGV4dElmRW1wdHkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGYuY2FsbChjb250ZXh0LCB0aGlzLmdldCgpKTtcbiAgICAgIH1cbiAgICB9LmJpbmQodGhpcyk7XG4gIH0sXG5cbiAgLy8gVE9ETzogZm9sZCBvciByZWR1Y2U/XG4gIHJlZHVjZTogZnVuY3Rpb24gKGYsIGlmRW1wdHksIGNvbnRleHQpIHtcbiAgICBpZiAodGhpcy5pc0VtcHR5KCkpIHtcbiAgICAgIHJldHVybiByZXN1bHQoaWZFbXB0eSwgY29udGV4dCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBmLmNhbGwoY29udGV4dCwgdGhpcy5nZXQoKSk7XG4gICAgfVxuICB9LFxuICBcbiAgZmxhdE1hcDogZnVuY3Rpb24gKGYsIGNvbnRleHQpIHtcbiAgICBpZiAodGhpcy5pc0VtcHR5KCkpIHtcbiAgICAgIHJldHVybiBOb25lO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gZi5jYWxsKGNvbnRleHQsIHRoaXMuZ2V0KCkpO1xuICAgIH1cbiAgfSxcblxuICBmbGF0dGVuOiBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHRoaXMuaXNFbXB0eSgpKSB7XG4gICAgICByZXR1cm4gTm9uZTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0KCk7XG4gICAgfVxuICB9LFxuXG4gIGZpbHRlcjogZnVuY3Rpb24gKHAsIGNvbnRleHQpIHtcbiAgICBpZiAodGhpcy5pc0VtcHR5KCkgfHwgcC5jYWxsKGNvbnRleHQsIHRoaXMuZ2V0KCkpKSB7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIE5vbmU7XG4gICAgfVxuICB9LFxuXG4gIGZpbHRlck5vdDogZnVuY3Rpb24gKHAsIGNvbnRleHQpIHtcbiAgICBpZiAodGhpcy5pc0VtcHR5KCkgfHwgIXAuY2FsbChjb250ZXh0LCB0aGlzLmdldCgpKSkge1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBOb25lO1xuICAgIH1cbiAgfSxcblxuICBub25FbXB0eTogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLmlzRGVmaW5lZCgpO1xuICB9LFxuXG4gIC8vIFRPRE86IFRoaXMgaXMgdGhlIGV4YWN0IHNhbWUgY29kZSBhcyBpbiBUcnlcbiAgd2l0aEZpbHRlcjogZnVuY3Rpb24gKHAsIGNvbnRleHQpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICB2YXIgV2l0aEZpbHRlciA9IENsYXNzKGZ1bmN0aW9uIFdpdGhGaWx0ZXIocCwgY29udGV4dCkge1xuICAgICAgdGhpcy5wID0gcDtcbiAgICAgIHRoaXMuY29udGV4dCA9IGNvbnRleHQ7XG4gICAgfSkuYm9keSh7XG4gICAgICBtYXA6IGZ1bmN0aW9uIChmLCBjb250ZXh0KSB7XG4gICAgICAgIHJldHVybiBzZWxmLmZpbHRlcih0aGlzLnAsIHRoaXMuY29udGV4dCkubWFwKGYsIGNvbnRleHQpO1xuICAgICAgfSxcbiAgICAgIGZsYXRNYXA6IGZ1bmN0aW9uIChmLCBjb250ZXh0KSB7XG4gICAgICAgIHJldHVybiBzZWxmLmZpbHRlcih0aGlzLnAsIHRoaXMuY29udGV4dCkuZmxhdE1hcChmLCBjb250ZXh0KTtcbiAgICAgIH0sXG4gICAgICBmb3JFYWNoOiBmdW5jdGlvbiAoZiwgY29udGV4dCkge1xuICAgICAgICByZXR1cm4gc2VsZi5maWx0ZXIodGhpcy5wLCB0aGlzLmNvbnRleHQpLmZvckVhY2goZiwgY29udGV4dCk7XG4gICAgICB9LFxuICAgICAgd2l0aEZpbHRlcjogZnVuY3Rpb24gKHEsIGNvbnRleHQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBXaXRoRmlsdGVyKGZ1bmN0aW9uICh4KSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucC5jYWxsKHRoaXMuY29udGV4dCwgeCkgJiYgcS5jYWxsKGNvbnRleHQsIHgpO1xuICAgICAgICB9LmJpbmQodGhpcyksIGNvbnRleHQpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIG5ldyBXaXRoRmlsdGVyKHAsIGNvbnRleHQpO1xuICB9LFxuXG4gIGNvbnRhaW5zOiBmdW5jdGlvbiAoZWxlbSkge1xuICAgIHJldHVybiAhdGhpcy5pc0VtcHR5KCkgJiYgZXF1YWxzKHRoaXMuZ2V0KCksIGVsZW0pO1xuICB9LFxuXG4gIGV4aXN0czogZnVuY3Rpb24gKHAsIGNvbnRleHQpIHtcbiAgICByZXR1cm4gIXRoaXMuaXNFbXB0eSgpICYmIHAuY2FsbChjb250ZXh0LCB0aGlzLmdldCgpKTtcbiAgfSxcblxuICBmb3JBbGw6IGZ1bmN0aW9uIChwLCBjb250ZXh0KSB7XG4gICAgcmV0dXJuIHRoaXMuaXNFbXB0eSgpIHx8IHAuY2FsbChjb250ZXh0LCB0aGlzLmdldCgpKTtcbiAgfSxcblxuICBmb3JFYWNoOiBmdW5jdGlvbiAoZiwgY29udGV4dCkge1xuICAgIGlmICghdGhpcy5pc0VtcHR5KCkpIHtcbiAgICAgIHJldHVybiBmLmNhbGwoY29udGV4dCwgdGhpcy5nZXQoKSk7XG4gICAgfVxuICB9LFxuXG4gIC8vIFRPRE86IGNvbGxlY3RcblxuICBvckVsc2U6IGZ1bmN0aW9uIChhbHRlcm5hdGl2ZSwgY29udGV4dCkge1xuICAgIGlmICh0aGlzLmlzRW1wdHkoKSkge1xuICAgICAgcmV0dXJuIHJlc3VsdChhbHRlcm5hdGl2ZSwgY29udGV4dCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgfSxcblxuICAvLyBUT0RPOiBpdGVyYXRvclxuXG4gIC8vIFRPRE86IHRvTGlzdFxuXG4gIHRvUmlnaHQ6IGZ1bmN0aW9uIChsZWZ0LCBjb250ZXh0KSB7XG4gICAgaWYgKHMuRWl0aGVyKSB7XG4gICAgICByZXR1cm4gdGhpcy5pc0VtcHR5KCkgPyBzLkxlZnQocmVzdWx0KGxlZnQsIGNvbnRleHQpKSA6IHMuUmlnaHQodGhpcy5nZXQoKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IEVycm9yKFwiTW9kdWxlICdFaXRoZXInIG5vdCBsb2FkZWQuXCIpO1xuICAgIH1cbiAgfSxcblxuICB0b0xlZnQ6IGZ1bmN0aW9uIChyaWdodCwgY29udGV4dCkge1xuICAgIGlmIChzLkVpdGhlcikge1xuICAgICAgcmV0dXJuIHRoaXMuaXNFbXB0eSgpID8gcy5SaWdodChyZXN1bHQocmlnaHQsIGNvbnRleHQpKSA6IHMuTGVmdCh0aGlzLmdldCgpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgRXJyb3IoXCJNb2R1bGUgJ0VpdGhlcicgbm90IGxvYWRlZC5cIik7XG4gICAgfVxuICB9XG59KTtcblxuT3B0aW9uLmVtcHR5ID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gTm9uZTtcbn07XG5cbnZhciBTb21lID0gQ2FzZUNsYXNzKGZ1bmN0aW9uIFNvbWUoeCkge1xuICB0aGlzLnggPSB4O1xufSkuZXh0ZW5kcyhPcHRpb24pLmJvZHkoe1xuXG4gIGdldDogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLng7XG4gIH0sXG5cbiAgaXNFbXB0eTogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufSk7XG5cbnZhciBOb25lID0gQ2FzZVNpbmdsZXRvbihmdW5jdGlvbiBOb25lKCkge1xufSkuZXh0ZW5kcyhPcHRpb24pLmJvZHkoe1xuXG4gIGdldDogZnVuY3Rpb24gKCkge1xuICAgIHRocm93IG5ldyBOb1N1Y2hFbGVtZW50RXhjZXB0aW9uKFwiTm9uZS5nZXRcIik7XG4gIH0sXG5cbiAgaXNFbXB0eTogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG59KTtcblxuZXhwb3J0cy5PcHRpb24gPSBPcHRpb247XG5leHBvcnRzLlNvbWUgPSBTb21lO1xuZXhwb3J0cy5Ob25lID0gTm9uZTtcblxuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL09wdGlvbi5qc1wiLFwiL1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBzID0gcmVxdWlyZSgnLi9nbG9iYWwuanMnKS5zO1xuXG52YXIgQW55ID0gcmVxdWlyZSgnLi9BbnkuanMnKS5Bbnk7XG52YXIgRXF1YWxzID0gcmVxdWlyZSgnLi9FcXVhbHMuanMnKS5FcXVhbHM7XG5cbnZhciBDbGFzcyA9IHJlcXVpcmUoJy4vbGFuZy9DbGFzcy5qcycpLkNsYXNzO1xudmFyIFRyYWl0ID0gcmVxdWlyZSgnLi9sYW5nL1RyYWl0LmpzJykuVHJhaXQ7XG5cbnZhciBleGNlcHRpb24gPSByZXF1aXJlKCcuL2xhbmcvZXhjZXB0aW9uLmpzJyk7XG52YXIgSW5kZXhPdXRPZkJvdW5kc0V4Y2VwdGlvbiA9IGV4Y2VwdGlvbi5JbmRleE91dE9mQm91bmRzRXhjZXB0aW9uO1xuXG52YXIgZXF1YWxzID0gcmVxdWlyZSgnLi9sYW5nL2NvbW1vbi9lcXVhbHMuanMnKS5lcXVhbHM7XG52YXIgaXNJbnN0YW5jZU9mID0gcmVxdWlyZSgnLi9sYW5nL2NvbW1vbi9pc0luc3RhbmNlT2YuanMnKS5pc0luc3RhbmNlT2Y7XG5cbnZhciBQcm9kdWN0ID0gVHJhaXQoXCJQcm9kdWN0XCIpLndpdGgoRXF1YWxzKS5ib2R5KHtcbiAgcHJvZHVjdEVsZW1lbnQ6IGZ1bmN0aW9uIChuKSB7XG4gICAgaWYgKG4gPCB0aGlzLnByb2R1Y3RBcml0eSgpKSB7XG4gICAgICByZXR1cm4gdGhpc1snXycgKyAobiArIDEpXTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEluZGV4T3V0T2ZCb3VuZHNFeGNlcHRpb24obik7XG4gICAgfVxuICB9LFxuXG4gIHByb2R1Y3RBcml0eTogVHJhaXQucmVxdWlyZWQsXG5cbiAgcHJvZHVjdEl0ZXJhdG9yOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBjID0gMDtcbiAgICB2YXIgY21heCA9IHNlbGYucHJvZHVjdEFyaXR5KCk7XG4gICAgcmV0dXJuIG5ldyAoQ2xhc3MoQWJzdHJhY3RJdGVyYXRvcikuYm9keSh7XG4gICAgICBoYXNOZXh0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBjIDwgY21heDtcbiAgICAgIH0sXG4gICAgICBuZXh0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciByZXN1bHQgPSBzZWxmLnByb2R1Y3RFbGVtZW50KGMpO1xuICAgICAgICBjKys7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICB9XG4gICAgfSkpO1xuICB9LFxuXG4gIC8vIEhhY2t5IGltcGxlbWVudGF0aW9uLCBnb29kIGVub3VnaCBmb3Igbm93XG4gIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHZhbHVlcyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5wcm9kdWN0QXJpdHkoKTsgaSsrKSB7XG4gICAgICB2YWx1ZXMucHVzaCh0aGlzLnByb2R1Y3RFbGVtZW50KGkpLnRvU3RyaW5nKCkpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5wcm9kdWN0UHJlZml4ICsgJygnICsgdmFsdWVzLmpvaW4oJywnKSArICcpJztcbiAgfSxcblxuICBjYW5FcXVhbDogZnVuY3Rpb24gKFRoYXQpIHtcbiAgICByZXR1cm4gaXNJbnN0YW5jZU9mKHRoaXMsIFRoYXQpO1xuICB9LFxuXG4gIGVxdWFsczogZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgaWYgKHRoaXMuX19uYW1lX18gPT09IG90aGVyLl9fbmFtZV9fKSB7XG4gICAgICBpZiAob3RoZXIucHJvZHVjdEFyaXR5ICYmIHRoaXMucHJvZHVjdEFyaXR5KCkgPT09IG90aGVyLnByb2R1Y3RBcml0eSgpKSB7XG4gICAgICAgIHZhciByZXMgPSB0cnVlO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucHJvZHVjdEFyaXR5KCk7IGkrKykge1xuICAgICAgICAgIHJlcyA9IHJlcyAmJiBlcXVhbHModGhpcy5wcm9kdWN0RWxlbWVudChpKSwgb3RoZXIucHJvZHVjdEVsZW1lbnQoaSkpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH0sXG5cbiAgLy8gPz8/XG4gIHByb2R1Y3RQcmVmaXg6ICcnXG5cbn0pO1xuXG52YXIgUHJvZHVjdDEgPSBUcmFpdChcIlByb2R1Y3QxXCIpLmV4dGVuZHMoUHJvZHVjdCkuYm9keSh7XG4gIHByb2R1Y3RBcml0eTogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiAxO1xuICB9LFxuXG4gIF8xOiBUcmFpdC5yZXF1aXJlZFxufSk7XG5cbnZhciBQcm9kdWN0MiA9IFRyYWl0KFwiUHJvZHVjdDJcIikuZXh0ZW5kcyhQcm9kdWN0KS5ib2R5KHtcbiAgcHJvZHVjdEFyaXR5OiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIDI7XG4gIH0sXG5cbiAgXzE6IFRyYWl0LnJlcXVpcmVkLFxuICBfMjogVHJhaXQucmVxdWlyZWRcbn0pO1xuXG52YXIgUHJvZHVjdDMgPSBUcmFpdChcIlByb2R1Y3QzXCIpLmV4dGVuZHMoUHJvZHVjdCkuYm9keSh7XG4gIHByb2R1Y3RBcml0eTogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiAzO1xuICB9LFxuXG4gIF8xOiBUcmFpdC5yZXF1aXJlZCxcbiAgXzI6IFRyYWl0LnJlcXVpcmVkLFxuICBfMzogVHJhaXQucmVxdWlyZWRcbn0pO1xuXG5mdW5jdGlvbiBjcmVhdGVQcm9kdWN0KG4pIHtcbiAgdmFyIGJvZHkgPSB7XG4gICAgcHJvZHVjdEFyaXR5OiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gbjtcbiAgICB9XG4gIH07XG5cbiAgZm9yICh2YXIgaSA9IDE7IGkgPD0gbjsgaSsrKSB7XG4gICAgYm9keVsnXycgKyBpXSA9IFRyYWl0LnJlcXVpcmVkO1xuICB9XG5cbiAgcmV0dXJuIFRyYWl0KFwiUHJvZHVjdFwiICsgbikuZXh0ZW5kcyhQcm9kdWN0KS5ib2R5KGJvZHkpO1xufVxuXG5mdW5jdGlvbiBnZXRQcm9kdWN0KG4pIHtcbiAgaWYgKCFzWydQcm9kdWN0JyArIG5dKSB7XG4gICAgc1snUHJvZHVjdCcgKyBuXSA9IGNyZWF0ZVByb2R1Y3Qobik7XG4gIH1cbiAgcmV0dXJuIHNbJ1Byb2R1Y3QnICsgbl07XG59XG5cbmV4cG9ydHMuUHJvZHVjdCA9IFByb2R1Y3Q7XG5leHBvcnRzLlByb2R1Y3QxID0gUHJvZHVjdDE7XG5leHBvcnRzLlByb2R1Y3QyID0gUHJvZHVjdDI7XG5leHBvcnRzLlByb2R1Y3QzID0gUHJvZHVjdDM7XG5leHBvcnRzLmdldFByb2R1Y3QgPSBnZXRQcm9kdWN0O1xuXG5mb3IgKHZhciBpID0gNDsgaSA8PSAyMjsgaSsrKSB7XG4gIGV4cG9ydHNbJ1Byb2R1Y3QnICsgaV0gPSBnZXRQcm9kdWN0KGkpO1xufVxuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL1Byb2R1Y3QuanNcIixcIi9cIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgcyA9IHJlcXVpcmUoJy4vZ2xvYmFsLmpzJykucztcblxudmFyIEFueSA9IHJlcXVpcmUoJy4vQW55LmpzJykuQW55O1xuXG52YXIgQ2xhc3MgPSByZXF1aXJlKCcuL2xhbmcvQ2xhc3MuanMnKS5DbGFzcztcbnZhciBDYXNlQ2xhc3MgPSByZXF1aXJlKCcuL2xhbmcvQ2FzZUNsYXNzLmpzJykuQ2FzZUNsYXNzO1xuXG52YXIgcHJvZHVjdCA9IHJlcXVpcmUoJy4vUHJvZHVjdC5qcycpO1xudmFyIFByb2R1Y3QgPSBwcm9kdWN0LlByb2R1Y3Q7XG52YXIgUHJvZHVjdDEgPSBwcm9kdWN0LlByb2R1Y3QxO1xudmFyIFByb2R1Y3QyID0gcHJvZHVjdC5Qcm9kdWN0MjtcbnZhciBQcm9kdWN0MyA9IHByb2R1Y3QuUHJvZHVjdDM7XG52YXIgZ2V0UHJvZHVjdCA9IHByb2R1Y3QuZ2V0UHJvZHVjdDtcblxudmFyIFR1cGxlMSA9IENhc2VDbGFzcyhmdW5jdGlvbiBUdXBsZTEoXzEpIHtcbn0pLmV4dGVuZHMoUHJvZHVjdDEpLmJvZHkoKTtcblxudmFyIFR1cGxlMiA9IENhc2VDbGFzcyhmdW5jdGlvbiBUdXBsZTIoXzEsIF8yKSB7XG59KS5leHRlbmRzKFByb2R1Y3QyKS5ib2R5KCk7XG5cbnZhciBUdXBsZTMgPSBDYXNlQ2xhc3MoZnVuY3Rpb24gVHVwbGUzKF8xLCBfMiwgXzMpIHtcbn0pLmV4dGVuZHMoUHJvZHVjdDMpLmJvZHkoKTtcblxuZnVuY3Rpb24gY3JlYXRlVHVwbGUobikge1xuICB2YXIgZGVmYXVsdHMgPSB7fTtcbiAgZm9yICh2YXIgaSA9IDE7IGkgPD0gbjsgaSsrKSB7XG4gICAgZGVmYXVsdHNbJ18nICsgaV0gPSB1bmRlZmluZWQ7XG4gIH1cbiAgcmV0dXJuIENhc2VDbGFzcyhcIlR1cGxlXCIgKyBuLCBkZWZhdWx0cykuZXh0ZW5kcyhnZXRQcm9kdWN0KG4pKS5ib2R5KCk7XG59XG5cbmZ1bmN0aW9uIGdldFR1cGxlKG4pIHtcbiAgaWYgKCFzWydUdXBsZScgKyBuXSkge1xuICAgIHNbJ1R1cGxlJyArIG5dID0gY3JlYXRlVHVwbGUobik7XG4gIH1cbiAgcmV0dXJuIHNbJ1R1cGxlJyArIG5dO1xufVxuXG5mdW5jdGlvbiB0KCkge1xuICByZXR1cm4gZ2V0VHVwbGUoYXJndW1lbnRzLmxlbmd0aCkuYXBwbHkodW5kZWZpbmVkLCBhcmd1bWVudHMpO1xufVxuXG5leHBvcnRzLlR1cGxlMSA9IFR1cGxlMTtcbmV4cG9ydHMuVHVwbGUyID0gVHVwbGUyO1xuZXhwb3J0cy5UdXBsZTMgPSBUdXBsZTM7XG5leHBvcnRzLmdldFR1cGxlID0gZ2V0VHVwbGU7XG5leHBvcnRzLnQgPSB0O1xuXG5mb3IgKHZhciBpID0gNDsgaSA8PSAyMjsgaSsrKSB7XG4gIGV4cG9ydHNbJ1R1cGxlJyArIGldID0gZ2V0VHVwbGUoaSk7XG59XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvVHVwbGUuanNcIixcIi9cIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgcyA9IHJlcXVpcmUoJy4vZ2xvYmFsLmpzJykucztcblxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vbGFuZy9jb21tb24vZXh0ZW5kLmpzJykuZXh0ZW5kO1xuXG52YXIgbGFuZyA9IHJlcXVpcmUoJy4vbGFuZy5qcycpO1xuXG52YXIgZXhjZXB0aW9uID0gcmVxdWlyZSgnLi9sYW5nL2V4Y2VwdGlvbi5qcycpO1xuXG52YXIgcHJvZHVjdCA9IHJlcXVpcmUoJy4vUHJvZHVjdC5qcycpO1xudmFyIHR1cGxlID0gcmVxdWlyZSgnLi9UdXBsZS5qcycpO1xuXG52YXIgb3B0aW9uID0gcmVxdWlyZSgnLi9PcHRpb24uanMnKTtcblxudmFyIGFueSA9IHJlcXVpcmUoJy4vQW55LmpzJyk7XG52YXIgZXF1YWxzID0gcmVxdWlyZSgnLi9FcXVhbHMuanMnKTtcblxucyA9IGV4dGVuZChzLCBsYW5nKTtcbnMgPSBleHRlbmQocywgZXhjZXB0aW9uKTtcbnMgPSBleHRlbmQocywgcHJvZHVjdCk7XG5zID0gZXh0ZW5kKHMsIHR1cGxlKTtcbnMgPSBleHRlbmQocywgb3B0aW9uKTtcbnMgPSBleHRlbmQocywge1xuICBfOiB1bmRlZmluZWQsXG4gIEFueTogYW55LkFueSxcbiAgRXF1YWxzOiBlcXVhbHMuRXF1YWxzXG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBzO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL2Zha2VfMjZmZWJlOTkuanNcIixcIi9cIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgcyA9IHt9O1xuZXhwb3J0cy5zID0gcztcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIxWWlaNVNcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi9nbG9iYWwuanNcIixcIi9cIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgQ2xhc3MgPSByZXF1aXJlKCcuL2xhbmcvQ2xhc3MuanMnKS5DbGFzcztcbnZhciBTaW5nbGV0b24gPSByZXF1aXJlKCcuL2xhbmcvU2luZ2xldG9uLmpzJykuU2luZ2xldG9uO1xudmFyIENhc2VDbGFzcyA9IHJlcXVpcmUoJy4vbGFuZy9DYXNlQ2xhc3MuanMnKS5DYXNlQ2xhc3M7XG52YXIgQ2FzZVNpbmdsZXRvbiA9IHJlcXVpcmUoJy4vbGFuZy9DYXNlU2luZ2xldG9uLmpzJykuQ2FzZVNpbmdsZXRvbjtcbnZhciBUcmFpdCA9IHJlcXVpcmUoJy4vbGFuZy9UcmFpdC5qcycpLlRyYWl0O1xuXG52YXIgbGFuZyA9IHtcbiAgQ2xhc3M6IENsYXNzLFxuICBTaW5nbGV0b246IFNpbmdsZXRvbixcbiAgQ2FzZUNsYXNzOiBDYXNlQ2xhc3MsXG4gIENhc2VTaW5nbGV0b246IENhc2VTaW5nbGV0b24sXG4gIFRyYWl0OiBUcmFpdFxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBsYW5nO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL2xhbmcuanNcIixcIi9cIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgQW55ID0gcmVxdWlyZSgnLi4vQW55LmpzJykuQW55O1xuXG52YXIgbWFrZUNsYXNzQnVpbGRlciA9IHJlcXVpcmUoJy4vQ2xhc3MuanMnKS5tYWtlQ2xhc3NCdWlsZGVyO1xudmFyIG1ha2VXaXRoVHJhaXRDbGFzc0J1aWxkZXIgPSByZXF1aXJlKCcuL0NsYXNzLmpzJykubWFrZVdpdGhUcmFpdENsYXNzQnVpbGRlcjtcblxudmFyIGNhc2VDbGFzc2lmeSA9IHJlcXVpcmUoJy4vY29tbW9uL2Nhc2VDbGFzc2lmeS5qcycpLmNhc2VDbGFzc2lmeTtcblxudmFyIGlzRnVuY3Rpb24gPSByZXF1aXJlKCcuL2NvbW1vbi90eXBlQ2hlY2suanMnKS5pc0Z1bmN0aW9uO1xudmFyIGlzU3RyaW5nID0gcmVxdWlyZSgnLi9jb21tb24vdHlwZUNoZWNrLmpzJykuaXNTdHJpbmc7XG52YXIgaXNBcnJheSA9IHJlcXVpcmUoJy4vY29tbW9uL3R5cGVDaGVjay5qcycpLmlzQXJyYXk7XG52YXIgaXNPYmplY3QgPSByZXF1aXJlKCcuL2NvbW1vbi90eXBlQ2hlY2suanMnKS5pc09iamVjdDtcblxuZnVuY3Rpb24gZ2V0TmFtZShmbikge1xuICAvLyBUT0RPOiBDcm9zcy1icm93c2VyP1xuICByZXR1cm4gZm4ubmFtZTtcbn1cblxuZnVuY3Rpb24gbWFrZUNhc2VDbGFzc0J1aWxkZXIoQ2xhc3NCdWlsZGVyKSB7XG5cbiAgZnVuY3Rpb24gQ2FzZUNsYXNzQnVpbGRlcihuYW1lLCBDdG9yKSB7XG4gICAgaWYgKGlzRnVuY3Rpb24obmFtZSkpIHtcbiAgICAgIHRoaXMuQ3RvciA9IG5hbWU7XG4gICAgICB0aGlzLm5hbWUgPSBnZXROYW1lKHRoaXMuQ3Rvcik7XG4gICAgfVxuICAgIGVsc2UgaWYgKGlzU3RyaW5nKG5hbWUpKSB7XG4gICAgICB0aGlzLkN0b3IgPSBmdW5jdGlvbiBDYXNlQ2xhc3MoKSB7XG4gICAgICAgIGlmICh0aGlzLmNvbnN0cnVjdG9yKSB7XG4gICAgICAgICAgdGhpcy5jb25zdHJ1Y3Rvci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgdGhpcy5uYW1lID0gbmFtZTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICB0aHJvdyBFcnJvcihcIndyb25nXCIpXG4gICAgfVxuXG4gICAgaWYgKGlzT2JqZWN0KEN0b3IpKSB7XG4gICAgICB0aGlzLmRlZmF1bHRzID0gQ3RvcjtcbiAgICB9XG5cbiAgICB0aGlzLkN0b3IucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShBbnkucHJvdG90eXBlKTtcbiAgICB0aGlzLkN0b3IucHJvdG90eXBlWydfXycgKyB0aGlzLm5hbWUgKyAnX18nXSA9IHRydWU7XG4gIH1cblxuICBDYXNlQ2xhc3NCdWlsZGVyLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoQ2xhc3NCdWlsZGVyLnByb3RvdHlwZSk7XG5cbiAgQ2FzZUNsYXNzQnVpbGRlci5wcm90b3R5cGUuYm9keSA9IGZ1bmN0aW9uIChib2R5KSB7XG4gICAgdmFyIEN0b3IgPSBDbGFzc0J1aWxkZXIucHJvdG90eXBlLmJvZHkuY2FsbCh0aGlzLCBib2R5KTsgLy8gc3VwZXIuYm9keShib2R5KTtcbiAgICByZXR1cm4gY2FzZUNsYXNzaWZ5KEN0b3IsIHRoaXMubmFtZSwgdGhpcy5kZWZhdWx0cyk7XG4gIH07XG5cbiAgcmV0dXJuIENhc2VDbGFzc0J1aWxkZXI7XG59XG5cbmZ1bmN0aW9uIG1ha2VXaXRoVHJhaXRDYXNlQ2xhc3NCdWlsZGVyKFdpdGhUcmFpdENsYXNzQnVpbGRlcikge1xuXG4gIGZ1bmN0aW9uIFdpdGhUcmFpdENhc2VDbGFzc0J1aWxkZXIoaW5zdGFuY2UpIHtcbiAgICB0aGlzLm5hbWUgPSBpbnN0YW5jZS5uYW1lO1xuICAgIHRoaXMuQ3RvciA9IGluc3RhbmNlLkN0b3I7XG4gICAgdGhpcy5kZWZhdWx0cyA9IGluc3RhbmNlLmRlZmF1bHRzO1xuICB9XG5cbiAgV2l0aFRyYWl0Q2FzZUNsYXNzQnVpbGRlci5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKFdpdGhUcmFpdENsYXNzQnVpbGRlci5wcm90b3R5cGUpO1xuXG4gIFdpdGhUcmFpdENhc2VDbGFzc0J1aWxkZXIucHJvdG90eXBlLmJvZHkgPSBmdW5jdGlvbiAoYm9keSkge1xuICAgIHZhciBDdG9yID0gV2l0aFRyYWl0Q2xhc3NCdWlsZGVyLnByb3RvdHlwZS5ib2R5LmNhbGwodGhpcywgYm9keSk7IC8vIHN1cGVyLmJvZHkoYm9keSk7XG4gICAgcmV0dXJuIGNhc2VDbGFzc2lmeShDdG9yLCB0aGlzLm5hbWUsIHRoaXMuZGVmYXVsdHMpO1xuICB9O1xuXG4gIHJldHVybiBXaXRoVHJhaXRDYXNlQ2xhc3NCdWlsZGVyO1xufVxuXG52YXIgV2l0aFRyYWl0Q2FzZUNsYXNzQnVpbGRlciA9IG1ha2VXaXRoVHJhaXRDYXNlQ2xhc3NCdWlsZGVyKG1ha2VXaXRoVHJhaXRDbGFzc0J1aWxkZXIoKSk7XG52YXIgQ2FzZUNsYXNzQnVpbGRlciA9IG1ha2VDYXNlQ2xhc3NCdWlsZGVyKG1ha2VDbGFzc0J1aWxkZXIoV2l0aFRyYWl0Q2FzZUNsYXNzQnVpbGRlcikpO1xuXG5mdW5jdGlvbiBDYXNlQ2xhc3MobmFtZSwgQ3Rvcikge1xuICByZXR1cm4gbmV3IENhc2VDbGFzc0J1aWxkZXIobmFtZSwgQ3Rvcik7XG59XG5cbmV4cG9ydHMubWFrZVdpdGhUcmFpdENhc2VDbGFzc0J1aWxkZXIgPSBtYWtlV2l0aFRyYWl0Q2FzZUNsYXNzQnVpbGRlcjtcbmV4cG9ydHMubWFrZUNhc2VDbGFzc0J1aWxkZXIgPSBtYWtlQ2FzZUNsYXNzQnVpbGRlcjtcblxuLy9leHBvcnRzLkNhc2VDbGFzc0J1aWxkZXIgPSBDYXNlQ2xhc3NCdWlsZGVyO1xuLy9leHBvcnRzLldpdGhUcmFpdENhc2VDbGFzc0J1aWxkZXIgPSBXaXRoVHJhaXRDYXNlQ2xhc3NCdWlsZGVyO1xuXG5leHBvcnRzLkNhc2VDbGFzcyA9IENhc2VDbGFzcztcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIxWWlaNVNcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi9sYW5nL0Nhc2VDbGFzcy5qc1wiLFwiL2xhbmdcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgbWFrZUNsYXNzQnVpbGRlciA9IHJlcXVpcmUoJy4vQ2xhc3MuanMnKS5tYWtlQ2xhc3NCdWlsZGVyO1xudmFyIG1ha2VXaXRoVHJhaXRDbGFzc0J1aWxkZXIgPSByZXF1aXJlKCcuL0NsYXNzLmpzJykubWFrZVdpdGhUcmFpdENsYXNzQnVpbGRlcjtcblxudmFyIG1ha2VDYXNlQ2xhc3NCdWlsZGVyID0gcmVxdWlyZSgnLi9DYXNlQ2xhc3MuanMnKS5tYWtlQ2FzZUNsYXNzQnVpbGRlcjtcbnZhciBtYWtlV2l0aFRyYWl0Q2FzZUNsYXNzQnVpbGRlciA9IHJlcXVpcmUoJy4vQ2FzZUNsYXNzLmpzJykubWFrZVdpdGhUcmFpdENhc2VDbGFzc0J1aWxkZXI7XG5cbnZhciBtYWtlU2luZ2xldG9uQnVpbGRlciA9IHJlcXVpcmUoJy4vU2luZ2xldG9uLmpzJykubWFrZVNpbmdsZXRvbkJ1aWxkZXI7XG52YXIgbWFrZVdpdGhUcmFpdFNpbmdsZXRvbkJ1aWxkZXIgPSByZXF1aXJlKCcuL1NpbmdsZXRvbi5qcycpLm1ha2VXaXRoVHJhaXRTaW5nbGV0b25CdWlsZGVyO1xuXG4vLyBXaGVyZSBpcyB5b3VyIGdvZCBub3c/XG52YXIgV2l0aFRyYWl0Q2FzZVNpbmdsZXRvbkJ1aWxkZXIgPSBtYWtlV2l0aFRyYWl0U2luZ2xldG9uQnVpbGRlcihtYWtlV2l0aFRyYWl0Q2FzZUNsYXNzQnVpbGRlcihtYWtlV2l0aFRyYWl0Q2xhc3NCdWlsZGVyKCkpKTtcbnZhciBDYXNlU2luZ2xldG9uQnVpbGRlciA9IG1ha2VTaW5nbGV0b25CdWlsZGVyKG1ha2VDYXNlQ2xhc3NCdWlsZGVyKG1ha2VDbGFzc0J1aWxkZXIoV2l0aFRyYWl0Q2FzZVNpbmdsZXRvbkJ1aWxkZXIpKSk7XG5cbmZ1bmN0aW9uIENhc2VTaW5nbGV0b24oQ3Rvcikge1xuICByZXR1cm4gbmV3IENhc2VTaW5nbGV0b25CdWlsZGVyKEN0b3IpO1xufVxuXG5leHBvcnRzLkNhc2VTaW5nbGV0b24gPSBDYXNlU2luZ2xldG9uO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL2xhbmcvQ2FzZVNpbmdsZXRvbi5qc1wiLFwiL2xhbmdcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgQW55ID0gcmVxdWlyZSgnLi4vQW55LmpzJykuQW55O1xuXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi9jb21tb24vZXh0ZW5kLmpzJykuZXh0ZW5kO1xudmFyIGlzU3RyaW5nID0gcmVxdWlyZSgnLi9jb21tb24vdHlwZUNoZWNrLmpzJykuaXNTdHJpbmc7XG52YXIgaXNGdW5jdGlvbiA9IHJlcXVpcmUoJy4vY29tbW9uL3R5cGVDaGVjay5qcycpLmlzRnVuY3Rpb247XG5cbmZ1bmN0aW9uIG1ha2VDbGFzc0J1aWxkZXIoV2l0aFRyYWl0Q2xhc3NCdWlsZGVyKSB7XG4gIGZ1bmN0aW9uIENsYXNzQnVpbGRlcihDdG9yLCBuYW1lKSB7XG4gICAgaWYgKGlzRnVuY3Rpb24oQ3RvcikpIHtcbiAgICAgIHRoaXMuQ3RvciA9IEN0b3I7XG4gICAgICBuYW1lID0gbmFtZSB8fCBDdG9yLm5hbWU7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuQ3RvciA9IGZ1bmN0aW9uIENsYXNzKCkge1xuICAgICAgICBpZiAodGhpcy5jb25zdHJ1Y3Rvcikge1xuICAgICAgICAgIHRoaXMuY29uc3RydWN0b3IuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIG5hbWUgPSBDdG9yXG4gICAgfVxuXG4gICAgdGhpcy5uYW1lID0gbmFtZTtcbiAgICB0aGlzLkN0b3IucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShBbnkucHJvdG90eXBlKTtcbiAgICB0aGlzLkN0b3IucHJvdG90eXBlWydfXycgKyB0aGlzLm5hbWUgKyAnX18nXSA9IHRydWU7XG4gIH1cblxuICBDbGFzc0J1aWxkZXIucHJvdG90eXBlID0ge1xuICAgIGJvZHk6IGZ1bmN0aW9uIChib2R5KSB7XG4gICAgICBib2R5ID0gYm9keSB8fCB7fTtcbiAgICAgIGV4dGVuZCh0aGlzLkN0b3IucHJvdG90eXBlLCBib2R5KTtcbiAgICAgIHRoaXMuQ3Rvci5wcm90b3R5cGUubmFtZSA9IHRoaXMubmFtZTtcbiAgICAgIHRoaXMuQ3Rvci5wcm90b3R5cGUuX19uYW1lX18gPSB0aGlzLm5hbWU7XG4gICAgICByZXR1cm4gdGhpcy5DdG9yO1xuICAgIH0sXG5cbiAgICBleHRlbmR6OiBmdW5jdGlvbiAoUGFyZW50KSB7XG4gICAgICB0aGlzLkN0b3IucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShQYXJlbnQucHJvdG90eXBlKTtcblxuICAgICAgaWYgKCFQYXJlbnQuX19BbnlfXykge1xuICAgICAgICBleHRlbmQodGhpcy5DdG9yLnByb3RvdHlwZSwgQW55LnByb3RvdHlwZSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuQ3Rvci5wcm90b3R5cGVbJ19fJyArIHRoaXMubmFtZSArICdfXyddID0gdHJ1ZTtcblxuICAgICAgcmV0dXJuIG5ldyBXaXRoVHJhaXRDbGFzc0J1aWxkZXIodGhpcyk7XG4gICAgfSxcblxuICAgICdleHRlbmRzJzogZnVuY3Rpb24gKFBhcmVudCkge1xuICAgICAgcmV0dXJuIHRoaXMuZXh0ZW5keihQYXJlbnQpO1xuICAgIH0sXG5cbiAgICB3aXRoejogZnVuY3Rpb24gKHRydCkge1xuICAgICAgaWYgKGlzRnVuY3Rpb24odHJ0KSkgeyAvLyBUcmFpdHMgYXJlIGZ1bmN0aW9uc1xuICAgICAgICBleHRlbmQodGhpcy5DdG9yLnByb3RvdHlwZSwgdHJ0LnByb3RvdHlwZSk7XG4gICAgICAgIHJldHVybiBuZXcgV2l0aFRyYWl0Q2xhc3NCdWlsZGVyKHRoaXMpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYm9keSh0cnQpO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICAnd2l0aCc6IGZ1bmN0aW9uICh0cnQpIHtcbiAgICAgIHJldHVybiB0aGlzLndpdGh6KHRydCk7XG4gICAgfVxuICB9O1xuXG4gIHJldHVybiBDbGFzc0J1aWxkZXI7XG59XG5cbmZ1bmN0aW9uIG1ha2VXaXRoVHJhaXRDbGFzc0J1aWxkZXIoKSB7XG4gIGZ1bmN0aW9uIFdpdGhUcmFpdENsYXNzQnVpbGRlcihpbnN0YW5jZSkge1xuICAgIHRoaXMubmFtZSA9IGluc3RhbmNlLm5hbWU7XG4gICAgdGhpcy5DdG9yID0gaW5zdGFuY2UuQ3RvcjtcbiAgfVxuXG4gIFdpdGhUcmFpdENsYXNzQnVpbGRlci5wcm90b3R5cGUgPSB7XG4gICAgYm9keTogZnVuY3Rpb24gKGJvZHkpIHtcbiAgICAgIGJvZHkgPSBib2R5IHx8IHt9O1xuICAgICAgZXh0ZW5kKHRoaXMuQ3Rvci5wcm90b3R5cGUsIGJvZHkpO1xuICAgICAgdGhpcy5DdG9yLnByb3RvdHlwZS5uYW1lID0gdGhpcy5uYW1lO1xuICAgICAgdGhpcy5DdG9yLnByb3RvdHlwZS5fX25hbWVfXyA9IHRoaXMubmFtZTtcbiAgICAgIHJldHVybiB0aGlzLkN0b3I7XG4gICAgfSxcblxuICAgIHdpdGh6OiBmdW5jdGlvbiAodHJ0KSB7XG4gICAgICBpZiAoaXNGdW5jdGlvbih0cnQpKSB7IC8vIFRyYWl0cyBhcmUgZnVuY3Rpb25zXG4gICAgICAgIGV4dGVuZCh0aGlzLkN0b3IucHJvdG90eXBlLCB0cnQucHJvdG90eXBlKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdGhpcy5ib2R5KHRydCk7XG4gICAgICB9XG4gICAgfSxcblxuICAgICd3aXRoJzogZnVuY3Rpb24gKHRydCkge1xuICAgICAgcmV0dXJuIHRoaXMud2l0aHoodHJ0KTtcbiAgICB9XG4gIH07XG5cbiAgcmV0dXJuIFdpdGhUcmFpdENsYXNzQnVpbGRlcjtcbn1cblxudmFyIFdpdGhUcmFpdENsYXNzQnVpbGRlciA9IG1ha2VXaXRoVHJhaXRDbGFzc0J1aWxkZXIoKTtcbnZhciBDbGFzc0J1aWxkZXIgPSBtYWtlQ2xhc3NCdWlsZGVyKFdpdGhUcmFpdENsYXNzQnVpbGRlcik7XG5cbmZ1bmN0aW9uIENsYXNzKEN0b3IsIG5hbWUpIHtcbiAgcmV0dXJuIG5ldyBDbGFzc0J1aWxkZXIoQ3RvciwgbmFtZSk7XG59XG5cbmV4cG9ydHMubWFrZUNsYXNzQnVpbGRlciA9IG1ha2VDbGFzc0J1aWxkZXI7XG5leHBvcnRzLm1ha2VXaXRoVHJhaXRDbGFzc0J1aWxkZXIgPSBtYWtlV2l0aFRyYWl0Q2xhc3NCdWlsZGVyO1xuXG4vL2V4cG9ydHMuQ2xhc3NCdWlsZGVyID0gQ2xhc3NCdWlsZGVyO1xuLy9leHBvcnRzLldpdGhUcmFpdENsYXNzQnVpbGRlciA9IFdpdGhUcmFpdENsYXNzQnVpbGRlcjtcblxuZXhwb3J0cy5DbGFzcyA9IENsYXNzO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL2xhbmcvQ2xhc3MuanNcIixcIi9sYW5nXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIG1ha2VDbGFzc0J1aWxkZXIgPSByZXF1aXJlKCcuL0NsYXNzLmpzJykubWFrZUNsYXNzQnVpbGRlcjtcbnZhciBtYWtlV2l0aFRyYWl0Q2xhc3NCdWlsZGVyID0gcmVxdWlyZSgnLi9DbGFzcy5qcycpLm1ha2VXaXRoVHJhaXRDbGFzc0J1aWxkZXI7XG5cbmZ1bmN0aW9uIG1ha2VTaW5nbGV0b25CdWlsZGVyKENsYXNzQnVpbGRlcikge1xuXG4gIGZ1bmN0aW9uIFNpbmdsZXRvbkJ1aWxkZXIoQ3Rvcikge1xuICAgIENsYXNzQnVpbGRlci5jYWxsKHRoaXMsIEN0b3IpO1xuICB9XG5cbiAgU2luZ2xldG9uQnVpbGRlci5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKENsYXNzQnVpbGRlci5wcm90b3R5cGUpO1xuXG4gIFNpbmdsZXRvbkJ1aWxkZXIucHJvdG90eXBlLmJvZHkgPSBmdW5jdGlvbiAoYm9keSkge1xuICAgIHZhciBDdG9yID0gQ2xhc3NCdWlsZGVyLnByb3RvdHlwZS5ib2R5LmNhbGwodGhpcywgYm9keSk7IC8vIHN1cGVyLmJvZHkoYm9keSk7XG4gICAgaWYgKCFDdG9yLmluc3RhbmNlKSB7XG4gICAgICBDdG9yLmluc3RhbmNlID0gbmV3IEN0b3IoKTtcbiAgICB9XG4gICAgcmV0dXJuIEN0b3IuaW5zdGFuY2U7XG4gIH07XG5cbiAgcmV0dXJuIFNpbmdsZXRvbkJ1aWxkZXI7XG59XG5cbmZ1bmN0aW9uIG1ha2VXaXRoVHJhaXRTaW5nbGV0b25CdWlsZGVyKFdpdGhUcmFpdENsYXNzQnVpbGRlcikge1xuXG4gIGZ1bmN0aW9uIFdpdGhUcmFpdENhc2VDbGFzc0J1aWxkZXIoaW5zdGFuY2UpIHtcbiAgICBXaXRoVHJhaXRDbGFzc0J1aWxkZXIuY2FsbCh0aGlzLCBpbnN0YW5jZSk7XG4gIH1cblxuICBXaXRoVHJhaXRDYXNlQ2xhc3NCdWlsZGVyLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoV2l0aFRyYWl0Q2xhc3NCdWlsZGVyLnByb3RvdHlwZSk7XG5cbiAgV2l0aFRyYWl0Q2FzZUNsYXNzQnVpbGRlci5wcm90b3R5cGUuYm9keSA9IGZ1bmN0aW9uIChib2R5KSB7XG4gICAgdmFyIEN0b3IgPSBXaXRoVHJhaXRDbGFzc0J1aWxkZXIucHJvdG90eXBlLmJvZHkuY2FsbCh0aGlzLCBib2R5KTsgLy8gc3VwZXIuYm9keShib2R5KTtcbiAgICBpZiAoIUN0b3IuaW5zdGFuY2UpIHtcbiAgICAgIEN0b3IuaW5zdGFuY2UgPSBuZXcgQ3RvcigpO1xuICAgIH1cbiAgICByZXR1cm4gQ3Rvci5pbnN0YW5jZTtcbiAgfTtcblxuICByZXR1cm4gV2l0aFRyYWl0Q2FzZUNsYXNzQnVpbGRlcjtcbn1cblxudmFyIFdpdGhUcmFpdFNpbmdsZXRvbkJ1aWxkZXIgPSBtYWtlV2l0aFRyYWl0U2luZ2xldG9uQnVpbGRlcihtYWtlV2l0aFRyYWl0Q2xhc3NCdWlsZGVyKCkpO1xudmFyIFNpbmdsZXRvbkJ1aWxkZXIgPSBtYWtlU2luZ2xldG9uQnVpbGRlcihtYWtlQ2xhc3NCdWlsZGVyKFdpdGhUcmFpdFNpbmdsZXRvbkJ1aWxkZXIpKTtcblxuZnVuY3Rpb24gU2luZ2xldG9uKEN0b3IpIHtcbiAgcmV0dXJuIG5ldyBTaW5nbGV0b25CdWlsZGVyKEN0b3IpO1xufVxuXG5leHBvcnRzLm1ha2VTaW5nbGV0b25CdWlsZGVyID0gbWFrZVNpbmdsZXRvbkJ1aWxkZXI7XG5leHBvcnRzLm1ha2VXaXRoVHJhaXRTaW5nbGV0b25CdWlsZGVyID0gbWFrZVdpdGhUcmFpdFNpbmdsZXRvbkJ1aWxkZXI7XG5cbi8vZXhwb3J0cy5TaW5nbGV0b25CdWlsZGVyID0gU2luZ2xldG9uQnVpbGRlcjtcbi8vZXhwb3J0cy5XaXRoVHJhaXRTaW5nbGV0b25CdWlsZGVyID0gV2l0aFRyYWl0U2luZ2xldG9uQnVpbGRlcjtcblxuZXhwb3J0cy5TaW5nbGV0b24gPSBTaW5nbGV0b247XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvbGFuZy9TaW5nbGV0b24uanNcIixcIi9sYW5nXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIEFueSA9IHJlcXVpcmUoJy4uL0FueS5qcycpLkFueTtcblxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vY29tbW9uL2V4dGVuZC5qcycpLmV4dGVuZDtcbnZhciBpc0Z1bmN0aW9uID0gcmVxdWlyZSgnLi9jb21tb24vdHlwZUNoZWNrLmpzJykuaXNGdW5jdGlvbjtcblxuZnVuY3Rpb24gVHJhaXRCdWlsZGVyKG5hbWUpIHtcbiAgaWYgKGlzRnVuY3Rpb24obmFtZSkpIHtcbiAgICB0aGlzLkN0b3IgPSBuYW1lO1xuICAgIG5hbWUgPSBuYW1lLm5hbWU7XG4gIH1cbiAgZWxzZSB7XG4gICAgdGhpcy5DdG9yID0gZnVuY3Rpb24gVHJhaXQoKSB7XG4gICAgfTtcbiAgICB0aGlzLkN0b3IucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShBbnkucHJvdG90eXBlKTtcbiAgfVxuXG4gIHRoaXMuQ3Rvci5wcm90b3R5cGUubmFtZSA9IG5hbWU7XG4gIHRoaXMuQ3Rvci5wcm90b3R5cGVbJ19fJyArIG5hbWUgKyAnX18nXSA9IHRydWU7XG59XG5cblRyYWl0QnVpbGRlci5wcm90b3R5cGUgPSB7XG4gIHdpdGh6OiBmdW5jdGlvbiAodHJ0KSB7XG4gICAgaWYgKGlzRnVuY3Rpb24odHJ0KSkgeyAvLyBUcmFpdHMgYXJlIGZ1bmN0aW9uc1xuICAgICAgZXh0ZW5kKHRoaXMuQ3Rvci5wcm90b3R5cGUsIHRydC5wcm90b3R5cGUpO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB0aGlzLmJvZHkodHJ0KTtcbiAgICB9XG4gIH0sXG4gIFxuICAnd2l0aCc6IGZ1bmN0aW9uICh0cnQpIHtcbiAgICByZXR1cm4gdGhpcy53aXRoeih0cnQpO1xuICB9LFxuICBcbiAgZXh0ZW5kejogZnVuY3Rpb24gKHRydCkge1xuICAgIHRoaXMuQ3Rvci5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKHRydC5wcm90b3R5cGUpO1xuXG4gICAgaWYgKCF0cnQuX19BbnlfXykge1xuICAgICAgZXh0ZW5kKHRoaXMuQ3Rvci5wcm90b3R5cGUsIEFueS5wcm90b3R5cGUpO1xuICAgIH1cblxuICAgIHRoaXMuQ3Rvci5wcm90b3R5cGVbJ19fJyArIHRoaXMubmFtZSArICdfXyddID0gdHJ1ZTtcbiAgICBcbiAgICAvLyBUT0RPOiBXaXRoVHJhaXRUcmFpdEJ1aWxkZXJcbiAgICByZXR1cm4gdGhpcztcbiAgfSxcbiAgXG4gICdleHRlbmRzJzogZnVuY3Rpb24gKHRydCkge1xuICAgIHJldHVybiB0aGlzLmV4dGVuZHoodHJ0KTtcbiAgfSxcbiAgXG4gIGJvZHk6IGZ1bmN0aW9uIChib2R5KSB7XG4gICAgYm9keSA9IGJvZHkgfHwge307XG4gICAgZXh0ZW5kKHRoaXMuQ3Rvci5wcm90b3R5cGUsIGJvZHkpO1xuICAgIHJldHVybiB0aGlzLkN0b3I7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIFRyYWl0KG5hbWUsIGJvZHkpIHtcbiAgdmFyIHRyYWl0QnVpbGRlciA9IG5ldyBUcmFpdEJ1aWxkZXIobmFtZSk7XG4gIHJldHVybiBib2R5ID8gdHJhaXRCdWlsZGVyLmJvZHkoYm9keSkgOiB0cmFpdEJ1aWxkZXI7XG59XG5cblRyYWl0LnJlcXVpcmVkID0gZnVuY3Rpb24gKCkge1xuICB0aHJvdyBuZXcgRXJyb3IoXCJOb3QgaW1wbGVtZW50ZWRcIik7XG59O1xuXG5leHBvcnRzLlRyYWl0ID0gVHJhaXQ7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvbGFuZy9UcmFpdC5qc1wiLFwiL2xhbmdcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgY2FzZUNsYXNzaWZ5ID0gcmVxdWlyZSgnLi9jb21tb24vY2FzZUNsYXNzaWZ5LmpzJykuY2FzZUNsYXNzaWZ5O1xudmFyIGVxdWFscyA9IHJlcXVpcmUoJy4vY29tbW9uL2VxdWFscy5qcycpLmVxdWFscztcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL2NvbW1vbi9leHRlbmQuanMnKS5leHRlbmQ7XG52YXIgaXNJbnN0YW5jZU9mID0gcmVxdWlyZSgnLi9jb21tb24vaXNJbnN0YW5jZU9mLmpzJykuaXNJbnN0YW5jZU9mO1xudmFyIG1hdGNoID0gcmVxdWlyZSgnLi9jb21tb24vbWF0Y2guanMnKS5tYXRjaDtcbnZhciByZXN1bHQgPSByZXF1aXJlKCcuL2NvbW1vbi9yZXN1bHQuanMnKS5yZXN1bHQ7XG52YXIgaXNGdW5jdGlvbiA9IHJlcXVpcmUoJy4vY29tbW9uL3R5cGVDaGVjay5qcycpLmlzRnVuY3Rpb247XG52YXIgaXNPYmplY3QgPSByZXF1aXJlKCcuL2NvbW1vbi90eXBlQ2hlY2suanMnKS5pc09iamVjdDtcbnZhciB3cmFwID0gcmVxdWlyZSgnLi9jb21tb24vd3JhcC5qcycpLndyYXA7XG5cbnZhciBjb21tb24gPSB7XG4gIGNhc2VDbGFzc2lmeTogY2FzZUNsYXNzaWZ5LFxuICBlcXVhbHM6IGVxdWFscyxcbiAgZXh0ZW5kOiBleHRlbmQsXG4gIG1hdGNoOiBtYXRjaCxcbiAgcmVzdWx0OiByZXN1bHQsXG4gIGlzRnVuY3Rpb246IGlzRnVuY3Rpb24sXG4gIGlzT2JqZWN0OiBpc09iamVjdCxcbiAgd3JhcDogd3JhcFxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBjb21tb247XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvbGFuZy9jb21tb24uanNcIixcIi9sYW5nXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIEluZGV4T3V0T2ZCb3VuZHNFeGNlcHRpb24gPSByZXF1aXJlKCcuLi9leGNlcHRpb24uanMnKS5JbmRleE91dE9mQm91bmRzRXhjZXB0aW9uO1xudmFyIFByb2R1Y3QgPSByZXF1aXJlKCcuLi8uLi9Qcm9kdWN0LmpzJykuUHJvZHVjdDtcblxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vZXh0ZW5kLmpzJykuZXh0ZW5kO1xudmFyIG1hdGNoID0gcmVxdWlyZSgnLi9tYXRjaC5qcycpLm1hdGNoO1xuXG52YXIgaXNPYmplY3QgPSByZXF1aXJlKCcuL3R5cGVDaGVjay5qcycpLmlzT2JqZWN0O1xuXG4vKipcbiAqIChjKSBBbmd1bGFyLmpzXG4gKi9cbnZhciBGTl9BUkdTID0gL15mdW5jdGlvblxccypbXlxcKF0qXFwoXFxzKihbXlxcKV0qKVxcKS9tO1xudmFyIEZOX0FSR19TUExJVCA9IC8sLztcbnZhciBTVFJJUF9DT01NRU5UUyA9IC8oKFxcL1xcLy4qJCl8KFxcL1xcKltcXHNcXFNdKj9cXCpcXC8pKS9tZztcblxuLyoqXG4gKiAoYykgQW5ndWxhci5qc1xuICovXG5mdW5jdGlvbiBnZXRBcmd1bWVudE5hbWVzKGZuKSB7XG4gIHZhciBmblRleHQsIGFyZ0RlY2wsIHJlcyA9IFtdO1xuXG4gIGlmICh0eXBlb2YgZm4gPT09ICdmdW5jdGlvbicpIHtcbiAgICBmblRleHQgPSBmbi50b1N0cmluZygpLnJlcGxhY2UoU1RSSVBfQ09NTUVOVFMsICcnKTtcbiAgICBhcmdEZWNsID0gZm5UZXh0Lm1hdGNoKEZOX0FSR1MpO1xuICAgIEFycmF5LnByb3RvdHlwZS5mb3JFYWNoLmNhbGwoYXJnRGVjbFsxXS5zcGxpdChGTl9BUkdfU1BMSVQpLCBmdW5jdGlvbiAoYXJnKSB7XG4gICAgICByZXMucHVzaChhcmcudHJpbSgpKTtcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiByZXM7XG59XG5cbmZ1bmN0aW9uIGdldE5hbWUoZm4pIHtcbiAgLy8gVE9ETzogQ3Jvc3MtYnJvd3Nlcj9cbiAgcmV0dXJuIGZuLm5hbWU7XG59XG5cbmZ1bmN0aW9uIGNhc2VDbGFzc2lmeShDdG9yLCBuYW1lLCBkZWZhdWx0cykge1xuICBcbiAgbmFtZSA9IG5hbWUgfHwgZ2V0TmFtZShDdG9yKTtcbiAgdmFyIGFyZ3VtZW50TmFtZXMgPSBpc09iamVjdChkZWZhdWx0cykgPyBPYmplY3Qua2V5cyhkZWZhdWx0cykgOiBnZXRBcmd1bWVudE5hbWVzKEN0b3IpO1xuICBcbiAgZGVmYXVsdHMgPSBkZWZhdWx0cyB8fCB7fTsgLy8gcHJldmVudCBleGNlcHRpb25zXG4gIFxuICB2YXIgRmFjdG9yeSA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gRmFjdG9yeS5hcHAuYXBwbHkodW5kZWZpbmVkLCBhcmd1bWVudHMpO1xuICB9O1xuXG4gIC8vIFRPRE86IFdoYXQgaXMgdGhlIG5hbWUgcHJvcGVydHkgYW55d2F5P1xuICBGYWN0b3J5Lm5hbWUgPSBuYW1lO1xuXG4gIEZhY3RvcnkuX19wcm9kdWN0X18gPSBuYW1lO1xuXG4gIEZhY3RvcnkuZnJvbUpTT04gPSBmdW5jdGlvbiAoanNvbk9iaikge1xuICAgIHZhciBjYyA9IG5ldyBDdG9yKCk7XG4gICAgT2JqZWN0LmtleXMoanNvbk9iaikuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgY2NbbmFtZV0gPSBqc29uT2JqW25hbWVdIHx8IGRlZmF1bHRzW2FyZ3VtZW50TmFtZXNbaV1dO1xuICAgIH0pO1xuICAgIHJldHVybiBjYztcbiAgfTtcblxuICBGYWN0b3J5LmFwcCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgY2MgPSBuZXcgQ3RvcigpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJndW1lbnROYW1lcy5sZW5ndGg7IGkrKykge1xuICAgICAgY2NbYXJndW1lbnROYW1lc1tpXV0gPSBhcmd1bWVudHNbaV0gfHwgZGVmYXVsdHNbYXJndW1lbnROYW1lc1tpXV07XG4gICAgfVxuICAgIHJldHVybiBjYztcbiAgfTtcblxuICBGYWN0b3J5LnVuQXBwID0gZnVuY3Rpb24gKGNjKSB7XG4gICAgcmV0dXJuIGFyZ3VtZW50TmFtZXMubWFwKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICByZXR1cm4gY2NbbmFtZV07XG4gICAgfSk7XG4gIH07XG5cbiAgZXh0ZW5kKEN0b3IucHJvdG90eXBlLCBQcm9kdWN0LnByb3RvdHlwZSk7XG4gIGV4dGVuZChDdG9yLnByb3RvdHlwZSwge1xuXG4gICAgLy8gVE9ETzogQmV0dGVyIG5hbWU/XG4gICAgX19mYWN0b3J5X186IEZhY3RvcnksXG5cbiAgICBuYW1lOiBuYW1lLFxuXG4gICAgY29weTogZnVuY3Rpb24gKHBhdGNoT2JqKSB7XG4gICAgICB2YXIgY29weSA9IG5ldyBDdG9yKHt9KTtcbiAgICAgIGFyZ3VtZW50TmFtZXMuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgICBpZiAocGF0Y2hPYmpbbmFtZV0pIGNvcHlbbmFtZV0gPSBwYXRjaE9ialtuYW1lXTtcbiAgICAgICAgZWxzZSBjb3B5W25hbWVdID0gdGhpc1tuYW1lXTtcbiAgICAgIH0sIHRoaXMpO1xuICAgICAgcmV0dXJuIGNvcHk7XG4gICAgfSxcblxuICAgIHByb2R1Y3RBcml0eTogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIGFyZ3VtZW50TmFtZXMubGVuZ3RoO1xuICAgIH0sXG5cbiAgICBwcm9kdWN0RWxlbWVudDogZnVuY3Rpb24gKG4pIHtcbiAgICAgIGlmIChuIDwgYXJndW1lbnROYW1lcy5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXNbYXJndW1lbnROYW1lc1tuXV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgSW5kZXhPdXRPZkJvdW5kc0V4Y2VwdGlvbigpO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICBwcm9kdWN0UHJlZml4OiBuYW1lLFxuXG4gICAgLypcbiAgICAgZXF1YWxzOiBmdW5jdGlvbiAob3RoZXIpIHtcbiAgICAgaWYgKG90aGVyLmlzSW5zdGFuY2VPZihQcm9kdWN0KSkge1xuICAgICBpZiAodGhpcy5wcm9kdWN0QXJpdHkoKSA9PT0gb3RoZXIucHJvZHVjdEFyaXR5KCkpIHtcbiAgICAgcmV0dXJuIHRoaXMucHJvZHVjdEl0ZXJhdG9yKCkuc2FtZUVsZW1lbnRzKG90aGVyLnByb2R1Y3RJdGVyYXRvcigpKTtcbiAgICAgfVxuICAgICB9XG5cbiAgICAgcmV0dXJuIGZhbHNlO1xuICAgICB9LFxuICAgICAqL1xuXG4gICAgaGFzaENvZGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGNvbnNvbGUud2FybihcImhhc2hDb2RlIGltcGxlbWVudGF0aW9uIG1pc3NpbmdcIik7XG4gICAgICByZXR1cm4gLTE7XG4gICAgfSxcblxuICAgIC8qXG4gICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgIHJldHVybiB0aGlzLnByb2R1Y3RJdGVyYXRvcigpLm1rU3RyaW5nKHRoaXMucHJvZHVjdFByZWZpeCArIFwiKFwiLCBcIixcIiwgXCIpXCIpO1xuICAgICB9LFxuICAgICAqL1xuXG4gICAgLy8gdGhpcyBpc24ndCByZWFsbHkgcmVxdWlyZWQuIEpTT04uc3RyaW5naWZ5IHdvcmtzIGFueXdheS4uLlxuICAgIHRvSlNPTjogZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHJlcyA9IHt9O1xuICAgICAgYXJndW1lbnROYW1lcy5tYXAoZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgcmVzW25hbWVdID0gdGhpc1tuYW1lXTtcbiAgICAgIH0sIHRoaXMpO1xuICAgICAgcmV0dXJuIHJlcztcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogU3RhcnQgYSBwc2V1ZG8gcGF0dGVybiBtYXRjaFxuICAgICAqIEByZXR1cm4geyp9XG4gICAgICovXG4gICAgbWF0Y2g6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBtYXRjaCh0aGlzKTtcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiBGYWN0b3J5O1xufVxuXG5leHBvcnRzLmNhc2VDbGFzc2lmeSA9IGNhc2VDbGFzc2lmeTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIxWWlaNVNcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi9sYW5nL2NvbW1vbi9jYXNlQ2xhc3NpZnkuanNcIixcIi9sYW5nL2NvbW1vblwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbmZ1bmN0aW9uIGVxdWFscyhvMSwgbzIpIHtcbiAgaWYgKG8xLmVxdWFscykge1xuICAgIGlmIChvMi5lcXVhbHMpIHtcbiAgICAgIHJldHVybiBvMS5lcXVhbHMobzIpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGlmIChvMi5lcXVhbHMpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG8xID09PSBvMjtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0cy5lcXVhbHMgPSBlcXVhbHM7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvbGFuZy9jb21tb24vZXF1YWxzLmpzXCIsXCIvbGFuZy9jb21tb25cIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5mdW5jdGlvbiBleHRlbmQob2JqLCBieSkge1xuICBieSA9IGJ5IHx8IHt9O1xuICBPYmplY3Qua2V5cyhieSkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgb2JqW2tleV0gPSBieVtrZXldO1xuICB9KTtcbiAgcmV0dXJuIG9iajtcbn1cblxuZXhwb3J0cy5leHRlbmQgPSBleHRlbmQ7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvbGFuZy9jb21tb24vZXh0ZW5kLmpzXCIsXCIvbGFuZy9jb21tb25cIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgaXNTdHJpbmcgPSByZXF1aXJlKCcuL3R5cGVDaGVjay5qcycpLmlzU3RyaW5nO1xuXG4vLyBUT0RPOiBsZXNzIGZ1Y2t1cFxuZnVuY3Rpb24gaXNJbnN0YW5jZU9mKHRoYXQsIGNsYXNzTGlrZSkge1xuICBpZiAoaXNTdHJpbmcoY2xhc3NMaWtlKSkge1xuICAgIHJldHVybiB0aGF0WydfXycgKyBjbGFzc0xpa2UgKyAnX18nXSA9PT0gdHJ1ZTtcbiAgfSBlbHNlIGlmIChjbGFzc0xpa2UuX19uYW1lX18pIHtcbiAgICByZXR1cm4gdGhhdFsnX18nICsgY2xhc3NMaWtlLl9fbmFtZV9fICsgJ19fJ10gPT09IHRydWU7XG4gIH0gZWxzZSBpZiAoY2xhc3NMaWtlLnByb3RvdHlwZS5fX25hbWVfXykge1xuICAgIHJldHVybiB0aGF0WydfXycgKyBjbGFzc0xpa2UucHJvdG90eXBlLl9fbmFtZV9fICsgJ19fJ10gPT09IHRydWU7XG4gIH0gZWxzZSBpZiAoY2xhc3NMaWtlLl9fcHJvZHVjdF9fKSB7XG4gICAgcmV0dXJuIHRoYXRbJ19fJyArIGNsYXNzTGlrZS5fX3Byb2R1Y3RfXyArICdfXyddID09PSB0cnVlO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiB0aGF0IGluc3RhbmNlb2YgY2xhc3NMaWtlO1xuICB9XG59XG5cbmV4cG9ydHMuaXNJbnN0YW5jZU9mID0gaXNJbnN0YW5jZU9mO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL2xhbmcvY29tbW9uL2lzSW5zdGFuY2VPZi5qc1wiLFwiL2xhbmcvY29tbW9uXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIGVxdWFscyA9IHJlcXVpcmUoJy4vZXF1YWxzLmpzJykuZXF1YWxzO1xudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vZXh0ZW5kLmpzJykuZXh0ZW5kO1xudmFyIGlzRnVuY3Rpb24gPSByZXF1aXJlKCcuL3R5cGVDaGVjay5qcycpLmlzRnVuY3Rpb247XG5cbnZhciBDbGFzcyA9IHJlcXVpcmUoJy4uL0NsYXNzLmpzJykuQ2xhc3M7XG5cbnZhciBDYXNlID0gQ2xhc3MoZnVuY3Rpb24gQ2FzZShvKSB7XG4gIHRoaXMubyA9IG87XG59KS53aXRoKHtcbiAgLyoqXG4gICAqXG4gICAqIEBwYXJhbSB7Qn0gb3RoZXIgLSBBbiBhcmJpdHJhcnkgb2JqZWN0IHRvIGNvbXBhcmUgdG9cbiAgICogQHBhcmFtIHtmdW5jdGlvbihCKTogUn0gZiAtIEEgY2FsbGJhY2sgZnVuY3Rpb24gaWYgaXQgaXMgYSBtYXRjaC5cbiAgICogQHBhcmFtIHtvYmplY3Q9fSBjb250ZXh0XG4gICAqIEByZXR1cm4ge01hdGNofENhc2V9XG4gICAqL1xuICBjYXplOiBmdW5jdGlvbiAob3RoZXIsIGYsIGNvbnRleHQpIHtcbiAgICBpZiAob3RoZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIHRoaXMuZG9DYXNlKG90aGVyLCBmLCBjb250ZXh0KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHRoaXMuZGVmYXVsdChmLCBjb250ZXh0KTtcbiAgICB9XG4gIH0sXG5cbiAgZG9DYXNlOiBmdW5jdGlvbiAob3RoZXIsIGYsIGNvbnRleHQpIHtcbiAgICByZXR1cm4gKGVxdWFscyh0aGlzLm8sIG90aGVyKSkgP1xuICAgICAgbmV3IE1hdGNoKGYuY2FsbChjb250ZXh0LCB0aGlzLm8pKSA6XG4gICAgICB0aGlzO1xuICB9LFxuXG4gIGdldHo6IGZ1bmN0aW9uICgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJNYXRjaEVycm9yXCIpO1xuICB9LFxuXG4gIGRlZmF1bHR6OiBmdW5jdGlvbiAoZiwgY29udGV4dCkge1xuICAgIHJldHVybiBuZXcgTWF0Y2goZi5jYWxsKGNvbnRleHQsIHRoaXMubykpO1xuICB9LFxuXG4gIC8vIEFsaWFzXG5cbiAgJ2Nhc2UnOiBmdW5jdGlvbiAob3RoZXIsIGYsIGNvbnRleHQpIHtcbiAgICByZXR1cm4gdGhpcy5jYXplKG90aGVyLCBmLCBjb250ZXh0KTtcbiAgfSxcblxuICAnZ2V0JzogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLmdldHooKTtcbiAgfSxcblxuICAnZGVmYXVsdCc6IGZ1bmN0aW9uIChmLCBjb250ZXh0KSB7XG4gICAgcmV0dXJuIHRoaXMuZGVmYXVsdHooZiwgY29udGV4dCk7XG4gIH1cbn0pO1xuXG52YXIgQ2FzZUNsYXNzQ2FzZSA9IENsYXNzKGZ1bmN0aW9uIENhc2VDbGFzc0Nhc2Uobykge1xuICB0aGlzLm8gPSBvO1xufSkuZXh0ZW5kcyhDYXNlKS53aXRoKHtcbiAgZG9DYXNlOiBmdW5jdGlvbiAoQ2xhc3MsIGYsIGNvbnRleHQpIHtcbiAgICByZXR1cm4gKHRoaXMuby5fX2ZhY3RvcnlfXy5fX3Byb2R1Y3RfXyA9PT0gQ2xhc3MuX19wcm9kdWN0X18gfHwgLyogQ2FzZVNpbmdsZXRvbiAqLyB0aGlzLm8gPT09IENsYXNzKSA/XG4gICAgICBuZXcgTWF0Y2goZi5hcHBseShjb250ZXh0LCB1bkFwcChDbGFzcywgdGhpcy5vKSkpIDpcbiAgICAgIHRoaXM7XG4gIH1cbn0pO1xuXG4vLyBUT0RPOiByZWN1cnNpdmUgdW5BcHBcbmZ1bmN0aW9uIHVuQXBwKENsYXNzLCBvKSB7XG4gIHJldHVybiBDbGFzcy51bkFwcCA/XG4gICAgQ2xhc3MudW5BcHAobykgOlxuICAgIFtvXTtcbn1cblxudmFyIENvbnN0cnVjdG9yQ2FzZSA9IENsYXNzKGZ1bmN0aW9uIENvbnN0cnVjdG9yQ2FzZShvKSB7XG4gIHRoaXMubyA9IG87XG59KS5leHRlbmRzKENhc2UpLndpdGgoe1xuICBkb0Nhc2U6IGZ1bmN0aW9uIChDbGFzcywgZiwgY29udGV4dCkge1xuICAgIHJldHVybiAodGhpcy5vIGluc3RhbmNlb2YgQ2xhc3MpID9cbiAgICAgIG5ldyBNYXRjaChmLmNhbGwoY29udGV4dCwgdGhpcy5vKSkgOlxuICAgICAgdGhpcztcbiAgfVxufSk7XG5cbi8qKlxuICogUmVwcmVzZW50cyBhIG1hdGNoLlxuICogQWxsIGZ1cnRoZXIgY2FsbHMgdG8gJ2Nhc2UnIHdpbGwgYmUgaWdub3JlZC5cbiAqXG4gKiBAcGFyYW0ge1J9IHJlcyBUaGUgcmVzdWx0IG9mIHRoZSBjYXNlIGNhbGxiYWNrIGZ1bmN0aW9uXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gTWF0Y2gocmVzKSB7XG4gIHRoaXMucmVzID0gcmVzO1xufVxuXG52YXIgTWF0Y2ggPSBDbGFzcyhmdW5jdGlvbiAocmVzKSB7XG4gIHRoaXMucmVzID0gcmVzO1xufSkuZXh0ZW5kcyhDYXNlKS53aXRoKHtcbiAgZG9DYXNlOiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH0sXG5cbiAgZ2V0ejogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLnJlcztcbiAgfSxcblxuICBkZWZhdWx0ejogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLnJlcztcbiAgfSxcblxuICAnZ2V0JzogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLnJlcztcbiAgfSxcblxuICAnZGVmYXVsdCc6IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5yZXM7XG4gIH1cbn0pO1xuXG4vKipcbiAqIFN0YXJ0cyBhIHBzZXVkbyBwYXR0ZXJuLW1hdGNoLlxuICpcbiAqIEBwYXJhbSB7Kn0gb1xuICogQHJldHVybiB7Q2FzZX1cbiAqL1xuZnVuY3Rpb24gbWF0Y2gobykge1xuICBpZiAoby5fX2ZhY3RvcnlfXyAmJiBvLl9fZmFjdG9yeV9fLnVuQXBwKSB7XG4gICAgcmV0dXJuIG5ldyBDYXNlQ2xhc3NDYXNlKG8pO1xuLy99IGVsc2UgaWYgKG8uX19BbnlfXykge1xuICAvLyByZXR1cm4gbmV3IENsYXNzQ2FzZShvKTtcbiAgfSBlbHNlIGlmIChpc0Z1bmN0aW9uKG8pKSB7XG4gICAgcmV0dXJuIG5ldyBDb25zdHJ1Y3RvckNhc2Uobyk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG5ldyBDYXNlKG8pO1xuICB9XG59XG5cbmV4cG9ydHMubWF0Y2ggPSBtYXRjaDtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIxWWlaNVNcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi9sYW5nL2NvbW1vbi9tYXRjaC5qc1wiLFwiL2xhbmcvY29tbW9uXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIGlzRnVuY3Rpb24gPSByZXF1aXJlKCcuL3R5cGVDaGVjay5qcycpLmlzRnVuY3Rpb247XG5cbmZ1bmN0aW9uIHJlc3VsdCh2YWx1ZSwgY29udGV4dCkge1xuICByZXR1cm4gaXNGdW5jdGlvbih2YWx1ZSkgPyB2YWx1ZS5jYWxsKGNvbnRleHQpIDogdmFsdWU7XG59XG5cbmV4cG9ydHMucmVzdWx0ID0gcmVzdWx0O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL2xhbmcvY29tbW9uL3Jlc3VsdC5qc1wiLFwiL2xhbmcvY29tbW9uXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuWydGdW5jdGlvbicsICdPYmplY3QnXVxuICAuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICAgIGV4cG9ydHNbJ2lzJyArIG5hbWVdID0gZnVuY3Rpb24gKG9iaikge1xuICAgICAgcmV0dXJuIHR5cGVvZiBvYmogPT09IG5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICB9XG4gIH0pO1xuXG5leHBvcnRzLmlzU3RyaW5nID0gZnVuY3Rpb24gKHMpIHtcbiAgcmV0dXJuIHR5cGVvZiBzID09PSAnc3RyaW5nJztcbn07XG5cbmV4cG9ydHMuaXNBcnJheSA9IGZ1bmN0aW9uIChhcnIpIHtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkoYXJyKTtcbn07XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvbGFuZy9jb21tb24vdHlwZUNoZWNrLmpzXCIsXCIvbGFuZy9jb21tb25cIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi9leHRlbmQuanMnKS5leHRlbmQ7XG52YXIgaXNGdW5jdGlvbiA9IHJlcXVpcmUoJy4vdHlwZUNoZWNrLmpzJykuaXNGdW5jdGlvbjtcblxuZnVuY3Rpb24gd3JhcCh0YXJnZXQpIHtcbiAgZnVuY3Rpb24gV3JhcHBlZCAoKSB7XG4gICAgcmV0dXJuIHRhcmdldC5hcHAuYXBwbHkodGFyZ2V0LCBhcmd1bWVudHMpO1xuICB9XG4gIFxuICBPYmplY3Qua2V5cyh0YXJnZXQpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgIHZhciB2YWx1ZSA9IHRhcmdldFtrZXldO1xuICAgIGlmIChpc0Z1bmN0aW9uKHZhbHVlKSkge1xuICAgICAgV3JhcHBlZFtrZXldID0gdmFsdWUuYmluZCh0YXJnZXQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBXcmFwcGVkW2tleV0gPSB2YWx1ZTtcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiBXcmFwcGVkO1xufVxuXG5leHBvcnRzLndyYXAgPSB3cmFwO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL2xhbmcvY29tbW9uL3dyYXAuanNcIixcIi9sYW5nL2NvbW1vblwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBDbGFzcyA9IHJlcXVpcmUoJy4vQ2xhc3MuanMnKS5DbGFzcztcblxudmFyIFRocm93YWJsZSA9IENsYXNzKFwiVGhyb3dhYmxlXCIpLmV4dGVuZHMoRXJyb3IpLmJvZHkoe1xuICBjb25zdHJ1Y3RvcjogZnVuY3Rpb24gKG1lc3NhZ2UsIGZpbGVOYW1lLCBsaW5lTnVtYmVyKSB7XG4gICAgRXJyb3IuY2FsbCh0aGlzLCBhcmd1bWVudHMpO1xuICAgIEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKHRoaXMsIHRoaXMucHJvdG90eXBlKTtcblxuICAgIGlmIChtZXNzYWdlKSB0aGlzLm1lc3NhZ2UgPSBtZXNzYWdlO1xuICAgIGlmIChmaWxlTmFtZSkgdGhpcy5maWxlTmFtZSA9IGZpbGVOYW1lO1xuICAgIGlmIChsaW5lTnVtYmVyKSB0aGlzLmxpbmVOdW1iZXIgPSBsaW5lTnVtYmVyO1xuICB9XG59KTtcblxudmFyIEV4Y2VwdGlvbiA9IENsYXNzKFwiRXhjZXB0aW9uXCIpLmV4dGVuZHMoVGhyb3dhYmxlKS5ib2R5KHt9KTtcbnZhciBSdW50aW1lRXhjZXB0aW9uID0gQ2xhc3MoXCJSdW50aW1lRXhjZXB0aW9uXCIpLmV4dGVuZHMoRXhjZXB0aW9uKS5ib2R5KHt9KTtcbnZhciBOb1N1Y2hFbGVtZW50RXhjZXB0aW9uID0gQ2xhc3MoXCJOb1N1Y2hFbGVtZW50RXhjZXB0aW9uXCIpLmV4dGVuZHMoUnVudGltZUV4Y2VwdGlvbikuYm9keSh7fSk7XG52YXIgVW5zdXBwb3J0ZWRPcGVyYXRpb25FeGNlcHRpb24gPSBDbGFzcyhcIlVuc3VwcG9ydGVkT3BlcmF0aW9uRXhjZXB0aW9uXCIpLmV4dGVuZHMoUnVudGltZUV4Y2VwdGlvbikuYm9keSh7fSk7XG52YXIgSW5kZXhPdXRPZkJvdW5kc0V4Y2VwdGlvbiA9IENsYXNzKFwiSW5kZXhPdXRPZkJvdW5kc0V4Y2VwdGlvblwiKS5leHRlbmRzKFJ1bnRpbWVFeGNlcHRpb24pLmJvZHkoe30pO1xudmFyIElsbGVnYWxBcmd1bWVudEV4Y2VwdGlvbiA9IENsYXNzKFwiSWxsZWdhbEFyZ3VtZW50RXhjZXB0aW9uXCIpLmV4dGVuZHMoUnVudGltZUV4Y2VwdGlvbikuYm9keSh7fSk7XG4vLyBUT0RPXG5cbmV4cG9ydHMuVGhyb3dhYmxlID0gVGhyb3dhYmxlO1xuZXhwb3J0cy5FeGNlcHRpb24gPSBFeGNlcHRpb247XG5leHBvcnRzLlJ1bnRpbWVFeGNlcHRpb24gPSBSdW50aW1lRXhjZXB0aW9uO1xuZXhwb3J0cy5Ob1N1Y2hFbGVtZW50RXhjZXB0aW9uID0gTm9TdWNoRWxlbWVudEV4Y2VwdGlvbjtcbmV4cG9ydHMuVW5zdXBwb3J0ZWRPcGVyYXRpb25FeGNlcHRpb24gPSBVbnN1cHBvcnRlZE9wZXJhdGlvbkV4Y2VwdGlvbjtcbmV4cG9ydHMuSW5kZXhPdXRPZkJvdW5kc0V4Y2VwdGlvbiA9IEluZGV4T3V0T2ZCb3VuZHNFeGNlcHRpb247XG5leHBvcnRzLklsbGVnYWxBcmd1bWVudEV4Y2VwdGlvbiA9IElsbGVnYWxBcmd1bWVudEV4Y2VwdGlvbjtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIxWWlaNVNcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi9sYW5nL2V4Y2VwdGlvbi5qc1wiLFwiL2xhbmdcIikiXX0=
