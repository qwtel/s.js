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

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/fake_daa224a9.js","/")
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
      extend(this.Ctor.prototype, trt.prototype);
      return new WithTraitClassBuilder(this);
    },

    'with': function (trt) {
      if (isFunction(trt)) { // Traits are functions
        return this.withz(trt);
      } else {
        return this.body(trt);
      }
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
      extend(this.Ctor.prototype, trt.prototype);
      return this;
    },

    'with': function (trt) {
      if (isFunction(trt)) { // Traits are functions
        return this.withz(trt);
      } else {
        return this.body(trt);
      }
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
  withz: function (Trait) {
    extend(this.Ctor.prototype, Trait.prototype);
    return this;
  },
  
  'with': function (Trait) {
    return this.withz(Trait);
  },
  
  extendz: function (Trait) {
    this.Ctor.prototype = Object.create(Trait.prototype);

    if (!Trait.__Any__) {
      extend(this.Ctor.prototype, Any.prototype);
    }

    this.Ctor.prototype['__' + this.name + '__'] = true;
    
    // TODO: WithTraitTraitBuilder
    return this;
  },
  
  'extends': function (Trait) {
    return this.extendz(Trait);
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

/**
 * @template B
 * @template R
 * @param o {B} Any JS value to match against.
 * @constructor
 */
function Case(o) {
  this.o = o;
}

Case.prototype = {

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
      return this.default(f, context).get();
    }
  },
  
  'case': function (other, f, context) {
    return this.caze(other, f, context);
  },

  doCase: function (other, f, context) {
    return (equals(this.o, other)) ?
      new Match(f.call(context, this.o)) :
      this;
  },

  /**
   * Can't get a result before a matching pattern has been found.
   * @throws {Error}
   */
  getz: function () {
    throw new Error("MatchError");
  },
  
  'get': function () {
    return this.getz();
  },
  
  defaultz: function (f, context) {
    return new Match(f.call(context, this.o)).get();
  },

  'default': function (f, context) {
    return this.defaultz(f, context);
  }
};

/**
 * Matching against a scalaish object.
 * This means a `isInstanceOf` method is present.
 *
 * @param {Any} o - A scalaish object
 * @constructor
 * @extends {Case}
 */
function CaseClassCase(o) {
  Case.call(this, o);
}

var unApp = function (Class, o) {
// TODO: recursive unApp
  return Class.unApp ?
    Class.unApp(o) :
    [o];
};

CaseClassCase.prototype = extend(Object.create(Case.prototype), {

  /**
   * @param {Factory} Class - The factory method (pseudo companion object) of a scalaish class
   * @param {function(B): R} f
   * @param {object=} context
   * @return {Match|CaseClassCase}
   */
  doCase: function (Class, f, context) {
    return (this.o.__factory__.__product__ === Class.__product__) ?
      new Match(f.apply(context, unApp(Class, this.o))) :
      this;
  }
});

/**
 * Matching against a JS object.
 * This means a the `instaceof` operator is used.
 *
 * @param {object} o
 * @constructor
 * @extends {Case}
 */
function ConstructorCase(o) {
  Case.call(this, o);
}

ConstructorCase.prototype = extend(Object.create(Case.prototype), {

  /**
   * Returns a `Match` if `this.o` has been created with the constructor `Class`.
   *
   * @param {function} Class - A regular JS constructor function
   * @param {function(B): R} f
   * @param {object=} context
   * @return {Match|ConstructorCase}
   */
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

Match.prototype = {
  /**
   * @return {Match|*}
   */
  caze: function (other) {
    if (other !== undefined) {
      return this;
    } else {
      return this.getz();
    }
  },
  
  'case': function (other) {
    return this.caze(other);
  },

  /**
   * Returns the result of the callback of the matching case.
   * This call to res is optional if you are not interested in the result.
   * @return {R}
   */
  getz: function () {
    return this.res;
  },
  
  'get': function () {
    return this.res;
  }
};

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
},{"./equals.js":20,"./extend.js":21,"./typeCheck.js":25,"1YiZ5S":4,"buffer":1}],24:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy9jZWxsMzAzL3Mvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwiL1VzZXJzL2NlbGwzMDMvcy9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvaW5kZXguanMiLCIvVXNlcnMvY2VsbDMwMy9zL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvYmFzZTY0LWpzL2xpYi9iNjQuanMiLCIvVXNlcnMvY2VsbDMwMy9zL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvaWVlZTc1NC9pbmRleC5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIiwiL1VzZXJzL2NlbGwzMDMvcy9zcmMvQW55LmpzIiwiL1VzZXJzL2NlbGwzMDMvcy9zcmMvRXF1YWxzLmpzIiwiL1VzZXJzL2NlbGwzMDMvcy9zcmMvT3B0aW9uLmpzIiwiL1VzZXJzL2NlbGwzMDMvcy9zcmMvUHJvZHVjdC5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvc3JjL1R1cGxlLmpzIiwiL1VzZXJzL2NlbGwzMDMvcy9zcmMvZmFrZV9kYWEyMjRhOS5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvc3JjL2dsb2JhbC5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvc3JjL2xhbmcuanMiLCIvVXNlcnMvY2VsbDMwMy9zL3NyYy9sYW5nL0Nhc2VDbGFzcy5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvc3JjL2xhbmcvQ2FzZVNpbmdsZXRvbi5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvc3JjL2xhbmcvQ2xhc3MuanMiLCIvVXNlcnMvY2VsbDMwMy9zL3NyYy9sYW5nL1NpbmdsZXRvbi5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvc3JjL2xhbmcvVHJhaXQuanMiLCIvVXNlcnMvY2VsbDMwMy9zL3NyYy9sYW5nL2NvbW1vbi5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvc3JjL2xhbmcvY29tbW9uL2Nhc2VDbGFzc2lmeS5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvc3JjL2xhbmcvY29tbW9uL2VxdWFscy5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvc3JjL2xhbmcvY29tbW9uL2V4dGVuZC5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvc3JjL2xhbmcvY29tbW9uL2lzSW5zdGFuY2VPZi5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvc3JjL2xhbmcvY29tbW9uL21hdGNoLmpzIiwiL1VzZXJzL2NlbGwzMDMvcy9zcmMvbGFuZy9jb21tb24vcmVzdWx0LmpzIiwiL1VzZXJzL2NlbGwzMDMvcy9zcmMvbGFuZy9jb21tb24vdHlwZUNoZWNrLmpzIiwiL1VzZXJzL2NlbGwzMDMvcy9zcmMvbGFuZy9jb21tb24vd3JhcC5qcyIsIi9Vc2Vycy9jZWxsMzAzL3Mvc3JjL2xhbmcvZXhjZXB0aW9uLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2bENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOU5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuLyohXG4gKiBUaGUgYnVmZmVyIG1vZHVsZSBmcm9tIG5vZGUuanMsIGZvciB0aGUgYnJvd3Nlci5cbiAqXG4gKiBAYXV0aG9yICAgRmVyb3NzIEFib3VraGFkaWplaCA8ZmVyb3NzQGZlcm9zcy5vcmc+IDxodHRwOi8vZmVyb3NzLm9yZz5cbiAqIEBsaWNlbnNlICBNSVRcbiAqL1xuXG52YXIgYmFzZTY0ID0gcmVxdWlyZSgnYmFzZTY0LWpzJylcbnZhciBpZWVlNzU0ID0gcmVxdWlyZSgnaWVlZTc1NCcpXG5cbmV4cG9ydHMuQnVmZmVyID0gQnVmZmVyXG5leHBvcnRzLlNsb3dCdWZmZXIgPSBCdWZmZXJcbmV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVMgPSA1MFxuQnVmZmVyLnBvb2xTaXplID0gODE5MlxuXG4vKipcbiAqIElmIGBCdWZmZXIuX3VzZVR5cGVkQXJyYXlzYDpcbiAqICAgPT09IHRydWUgICAgVXNlIFVpbnQ4QXJyYXkgaW1wbGVtZW50YXRpb24gKGZhc3Rlc3QpXG4gKiAgID09PSBmYWxzZSAgIFVzZSBPYmplY3QgaW1wbGVtZW50YXRpb24gKGNvbXBhdGlibGUgZG93biB0byBJRTYpXG4gKi9cbkJ1ZmZlci5fdXNlVHlwZWRBcnJheXMgPSAoZnVuY3Rpb24gKCkge1xuICAvLyBEZXRlY3QgaWYgYnJvd3NlciBzdXBwb3J0cyBUeXBlZCBBcnJheXMuIFN1cHBvcnRlZCBicm93c2VycyBhcmUgSUUgMTArLCBGaXJlZm94IDQrLFxuICAvLyBDaHJvbWUgNyssIFNhZmFyaSA1LjErLCBPcGVyYSAxMS42KywgaU9TIDQuMisuIElmIHRoZSBicm93c2VyIGRvZXMgbm90IHN1cHBvcnQgYWRkaW5nXG4gIC8vIHByb3BlcnRpZXMgdG8gYFVpbnQ4QXJyYXlgIGluc3RhbmNlcywgdGhlbiB0aGF0J3MgdGhlIHNhbWUgYXMgbm8gYFVpbnQ4QXJyYXlgIHN1cHBvcnRcbiAgLy8gYmVjYXVzZSB3ZSBuZWVkIHRvIGJlIGFibGUgdG8gYWRkIGFsbCB0aGUgbm9kZSBCdWZmZXIgQVBJIG1ldGhvZHMuIFRoaXMgaXMgYW4gaXNzdWVcbiAgLy8gaW4gRmlyZWZveCA0LTI5LiBOb3cgZml4ZWQ6IGh0dHBzOi8vYnVnemlsbGEubW96aWxsYS5vcmcvc2hvd19idWcuY2dpP2lkPTY5NTQzOFxuICB0cnkge1xuICAgIHZhciBidWYgPSBuZXcgQXJyYXlCdWZmZXIoMClcbiAgICB2YXIgYXJyID0gbmV3IFVpbnQ4QXJyYXkoYnVmKVxuICAgIGFyci5mb28gPSBmdW5jdGlvbiAoKSB7IHJldHVybiA0MiB9XG4gICAgcmV0dXJuIDQyID09PSBhcnIuZm9vKCkgJiZcbiAgICAgICAgdHlwZW9mIGFyci5zdWJhcnJheSA9PT0gJ2Z1bmN0aW9uJyAvLyBDaHJvbWUgOS0xMCBsYWNrIGBzdWJhcnJheWBcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG59KSgpXG5cbi8qKlxuICogQ2xhc3M6IEJ1ZmZlclxuICogPT09PT09PT09PT09PVxuICpcbiAqIFRoZSBCdWZmZXIgY29uc3RydWN0b3IgcmV0dXJucyBpbnN0YW5jZXMgb2YgYFVpbnQ4QXJyYXlgIHRoYXQgYXJlIGF1Z21lbnRlZFxuICogd2l0aCBmdW5jdGlvbiBwcm9wZXJ0aWVzIGZvciBhbGwgdGhlIG5vZGUgYEJ1ZmZlcmAgQVBJIGZ1bmN0aW9ucy4gV2UgdXNlXG4gKiBgVWludDhBcnJheWAgc28gdGhhdCBzcXVhcmUgYnJhY2tldCBub3RhdGlvbiB3b3JrcyBhcyBleHBlY3RlZCAtLSBpdCByZXR1cm5zXG4gKiBhIHNpbmdsZSBvY3RldC5cbiAqXG4gKiBCeSBhdWdtZW50aW5nIHRoZSBpbnN0YW5jZXMsIHdlIGNhbiBhdm9pZCBtb2RpZnlpbmcgdGhlIGBVaW50OEFycmF5YFxuICogcHJvdG90eXBlLlxuICovXG5mdW5jdGlvbiBCdWZmZXIgKHN1YmplY3QsIGVuY29kaW5nLCBub1plcm8pIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIEJ1ZmZlcikpXG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoc3ViamVjdCwgZW5jb2RpbmcsIG5vWmVybylcblxuICB2YXIgdHlwZSA9IHR5cGVvZiBzdWJqZWN0XG5cbiAgLy8gV29ya2Fyb3VuZDogbm9kZSdzIGJhc2U2NCBpbXBsZW1lbnRhdGlvbiBhbGxvd3MgZm9yIG5vbi1wYWRkZWQgc3RyaW5nc1xuICAvLyB3aGlsZSBiYXNlNjQtanMgZG9lcyBub3QuXG4gIGlmIChlbmNvZGluZyA9PT0gJ2Jhc2U2NCcgJiYgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBzdWJqZWN0ID0gc3RyaW5ndHJpbShzdWJqZWN0KVxuICAgIHdoaWxlIChzdWJqZWN0Lmxlbmd0aCAlIDQgIT09IDApIHtcbiAgICAgIHN1YmplY3QgPSBzdWJqZWN0ICsgJz0nXG4gICAgfVxuICB9XG5cbiAgLy8gRmluZCB0aGUgbGVuZ3RoXG4gIHZhciBsZW5ndGhcbiAgaWYgKHR5cGUgPT09ICdudW1iZXInKVxuICAgIGxlbmd0aCA9IGNvZXJjZShzdWJqZWN0KVxuICBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJylcbiAgICBsZW5ndGggPSBCdWZmZXIuYnl0ZUxlbmd0aChzdWJqZWN0LCBlbmNvZGluZylcbiAgZWxzZSBpZiAodHlwZSA9PT0gJ29iamVjdCcpXG4gICAgbGVuZ3RoID0gY29lcmNlKHN1YmplY3QubGVuZ3RoKSAvLyBhc3N1bWUgdGhhdCBvYmplY3QgaXMgYXJyYXktbGlrZVxuICBlbHNlXG4gICAgdGhyb3cgbmV3IEVycm9yKCdGaXJzdCBhcmd1bWVudCBuZWVkcyB0byBiZSBhIG51bWJlciwgYXJyYXkgb3Igc3RyaW5nLicpXG5cbiAgdmFyIGJ1ZlxuICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgIC8vIFByZWZlcnJlZDogUmV0dXJuIGFuIGF1Z21lbnRlZCBgVWludDhBcnJheWAgaW5zdGFuY2UgZm9yIGJlc3QgcGVyZm9ybWFuY2VcbiAgICBidWYgPSBCdWZmZXIuX2F1Z21lbnQobmV3IFVpbnQ4QXJyYXkobGVuZ3RoKSlcbiAgfSBlbHNlIHtcbiAgICAvLyBGYWxsYmFjazogUmV0dXJuIFRISVMgaW5zdGFuY2Ugb2YgQnVmZmVyIChjcmVhdGVkIGJ5IGBuZXdgKVxuICAgIGJ1ZiA9IHRoaXNcbiAgICBidWYubGVuZ3RoID0gbGVuZ3RoXG4gICAgYnVmLl9pc0J1ZmZlciA9IHRydWVcbiAgfVxuXG4gIHZhciBpXG4gIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzICYmIHR5cGVvZiBzdWJqZWN0LmJ5dGVMZW5ndGggPT09ICdudW1iZXInKSB7XG4gICAgLy8gU3BlZWQgb3B0aW1pemF0aW9uIC0tIHVzZSBzZXQgaWYgd2UncmUgY29weWluZyBmcm9tIGEgdHlwZWQgYXJyYXlcbiAgICBidWYuX3NldChzdWJqZWN0KVxuICB9IGVsc2UgaWYgKGlzQXJyYXlpc2goc3ViamVjdCkpIHtcbiAgICAvLyBUcmVhdCBhcnJheS1pc2ggb2JqZWN0cyBhcyBhIGJ5dGUgYXJyYXlcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChCdWZmZXIuaXNCdWZmZXIoc3ViamVjdCkpXG4gICAgICAgIGJ1ZltpXSA9IHN1YmplY3QucmVhZFVJbnQ4KGkpXG4gICAgICBlbHNlXG4gICAgICAgIGJ1ZltpXSA9IHN1YmplY3RbaV1cbiAgICB9XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBidWYud3JpdGUoc3ViamVjdCwgMCwgZW5jb2RpbmcpXG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicgJiYgIUJ1ZmZlci5fdXNlVHlwZWRBcnJheXMgJiYgIW5vWmVybykge1xuICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgYnVmW2ldID0gMFxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBidWZcbn1cblxuLy8gU1RBVElDIE1FVEhPRFNcbi8vID09PT09PT09PT09PT09XG5cbkJ1ZmZlci5pc0VuY29kaW5nID0gZnVuY3Rpb24gKGVuY29kaW5nKSB7XG4gIHN3aXRjaCAoU3RyaW5nKGVuY29kaW5nKS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgY2FzZSAnYXNjaWknOlxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICBjYXNlICdyYXcnOlxuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gZmFsc2VcbiAgfVxufVxuXG5CdWZmZXIuaXNCdWZmZXIgPSBmdW5jdGlvbiAoYikge1xuICByZXR1cm4gISEoYiAhPT0gbnVsbCAmJiBiICE9PSB1bmRlZmluZWQgJiYgYi5faXNCdWZmZXIpXG59XG5cbkJ1ZmZlci5ieXRlTGVuZ3RoID0gZnVuY3Rpb24gKHN0ciwgZW5jb2RpbmcpIHtcbiAgdmFyIHJldFxuICBzdHIgPSBzdHIgKyAnJ1xuICBzd2l0Y2ggKGVuY29kaW5nIHx8ICd1dGY4Jykge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoIC8gMlxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgICByZXQgPSB1dGY4VG9CeXRlcyhzdHIpLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICBjYXNlICdyYXcnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0ID0gYmFzZTY0VG9CeXRlcyhzdHIpLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aCAqIDJcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbmNvZGluZycpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5CdWZmZXIuY29uY2F0ID0gZnVuY3Rpb24gKGxpc3QsIHRvdGFsTGVuZ3RoKSB7XG4gIGFzc2VydChpc0FycmF5KGxpc3QpLCAnVXNhZ2U6IEJ1ZmZlci5jb25jYXQobGlzdCwgW3RvdGFsTGVuZ3RoXSlcXG4nICtcbiAgICAgICdsaXN0IHNob3VsZCBiZSBhbiBBcnJheS4nKVxuXG4gIGlmIChsaXN0Lmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBuZXcgQnVmZmVyKDApXG4gIH0gZWxzZSBpZiAobGlzdC5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gbGlzdFswXVxuICB9XG5cbiAgdmFyIGlcbiAgaWYgKHR5cGVvZiB0b3RhbExlbmd0aCAhPT0gJ251bWJlcicpIHtcbiAgICB0b3RhbExlbmd0aCA9IDBcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgICAgdG90YWxMZW5ndGggKz0gbGlzdFtpXS5sZW5ndGhcbiAgICB9XG4gIH1cblxuICB2YXIgYnVmID0gbmV3IEJ1ZmZlcih0b3RhbExlbmd0aClcbiAgdmFyIHBvcyA9IDBcbiAgZm9yIChpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgaXRlbSA9IGxpc3RbaV1cbiAgICBpdGVtLmNvcHkoYnVmLCBwb3MpXG4gICAgcG9zICs9IGl0ZW0ubGVuZ3RoXG4gIH1cbiAgcmV0dXJuIGJ1ZlxufVxuXG4vLyBCVUZGRVIgSU5TVEFOQ0UgTUVUSE9EU1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gX2hleFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgb2Zmc2V0ID0gTnVtYmVyKG9mZnNldCkgfHwgMFxuICB2YXIgcmVtYWluaW5nID0gYnVmLmxlbmd0aCAtIG9mZnNldFxuICBpZiAoIWxlbmd0aCkge1xuICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICB9IGVsc2Uge1xuICAgIGxlbmd0aCA9IE51bWJlcihsZW5ndGgpXG4gICAgaWYgKGxlbmd0aCA+IHJlbWFpbmluZykge1xuICAgICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gICAgfVxuICB9XG5cbiAgLy8gbXVzdCBiZSBhbiBldmVuIG51bWJlciBvZiBkaWdpdHNcbiAgdmFyIHN0ckxlbiA9IHN0cmluZy5sZW5ndGhcbiAgYXNzZXJ0KHN0ckxlbiAlIDIgPT09IDAsICdJbnZhbGlkIGhleCBzdHJpbmcnKVxuXG4gIGlmIChsZW5ndGggPiBzdHJMZW4gLyAyKSB7XG4gICAgbGVuZ3RoID0gc3RyTGVuIC8gMlxuICB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgYnl0ZSA9IHBhcnNlSW50KHN0cmluZy5zdWJzdHIoaSAqIDIsIDIpLCAxNilcbiAgICBhc3NlcnQoIWlzTmFOKGJ5dGUpLCAnSW52YWxpZCBoZXggc3RyaW5nJylcbiAgICBidWZbb2Zmc2V0ICsgaV0gPSBieXRlXG4gIH1cbiAgQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPSBpICogMlxuICByZXR1cm4gaVxufVxuXG5mdW5jdGlvbiBfdXRmOFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKHV0ZjhUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gX2FzY2lpV3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPVxuICAgIGJsaXRCdWZmZXIoYXNjaWlUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gX2JpbmFyeVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgcmV0dXJuIF9hc2NpaVdyaXRlKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbn1cblxuZnVuY3Rpb24gX2Jhc2U2NFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKGJhc2U2NFRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5mdW5jdGlvbiBfdXRmMTZsZVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKHV0ZjE2bGVUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uIChzdHJpbmcsIG9mZnNldCwgbGVuZ3RoLCBlbmNvZGluZykge1xuICAvLyBTdXBwb3J0IGJvdGggKHN0cmluZywgb2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nKVxuICAvLyBhbmQgdGhlIGxlZ2FjeSAoc3RyaW5nLCBlbmNvZGluZywgb2Zmc2V0LCBsZW5ndGgpXG4gIGlmIChpc0Zpbml0ZShvZmZzZXQpKSB7XG4gICAgaWYgKCFpc0Zpbml0ZShsZW5ndGgpKSB7XG4gICAgICBlbmNvZGluZyA9IGxlbmd0aFxuICAgICAgbGVuZ3RoID0gdW5kZWZpbmVkXG4gICAgfVxuICB9IGVsc2UgeyAgLy8gbGVnYWN5XG4gICAgdmFyIHN3YXAgPSBlbmNvZGluZ1xuICAgIGVuY29kaW5nID0gb2Zmc2V0XG4gICAgb2Zmc2V0ID0gbGVuZ3RoXG4gICAgbGVuZ3RoID0gc3dhcFxuICB9XG5cbiAgb2Zmc2V0ID0gTnVtYmVyKG9mZnNldCkgfHwgMFxuICB2YXIgcmVtYWluaW5nID0gdGhpcy5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKCFsZW5ndGgpIHtcbiAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgfSBlbHNlIHtcbiAgICBsZW5ndGggPSBOdW1iZXIobGVuZ3RoKVxuICAgIGlmIChsZW5ndGggPiByZW1haW5pbmcpIHtcbiAgICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICAgIH1cbiAgfVxuICBlbmNvZGluZyA9IFN0cmluZyhlbmNvZGluZyB8fCAndXRmOCcpLnRvTG93ZXJDYXNlKClcblxuICB2YXIgcmV0XG4gIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gX2hleFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgIHJldCA9IF91dGY4V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYXNjaWknOlxuICAgICAgcmV0ID0gX2FzY2lpV3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgIHJldCA9IF9iaW5hcnlXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0ID0gX2Jhc2U2NFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXQgPSBfdXRmMTZsZVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZW5jb2RpbmcnKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uIChlbmNvZGluZywgc3RhcnQsIGVuZCkge1xuICB2YXIgc2VsZiA9IHRoaXNcblxuICBlbmNvZGluZyA9IFN0cmluZyhlbmNvZGluZyB8fCAndXRmOCcpLnRvTG93ZXJDYXNlKClcbiAgc3RhcnQgPSBOdW1iZXIoc3RhcnQpIHx8IDBcbiAgZW5kID0gKGVuZCAhPT0gdW5kZWZpbmVkKVxuICAgID8gTnVtYmVyKGVuZClcbiAgICA6IGVuZCA9IHNlbGYubGVuZ3RoXG5cbiAgLy8gRmFzdHBhdGggZW1wdHkgc3RyaW5nc1xuICBpZiAoZW5kID09PSBzdGFydClcbiAgICByZXR1cm4gJydcblxuICB2YXIgcmV0XG4gIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gX2hleFNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgIHJldCA9IF91dGY4U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYXNjaWknOlxuICAgICAgcmV0ID0gX2FzY2lpU2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgIHJldCA9IF9iaW5hcnlTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0ID0gX2Jhc2U2NFNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXQgPSBfdXRmMTZsZVNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZW5jb2RpbmcnKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB7XG4gICAgdHlwZTogJ0J1ZmZlcicsXG4gICAgZGF0YTogQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwodGhpcy5fYXJyIHx8IHRoaXMsIDApXG4gIH1cbn1cblxuLy8gY29weSh0YXJnZXRCdWZmZXIsIHRhcmdldFN0YXJ0PTAsIHNvdXJjZVN0YXJ0PTAsIHNvdXJjZUVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5jb3B5ID0gZnVuY3Rpb24gKHRhcmdldCwgdGFyZ2V0X3N0YXJ0LCBzdGFydCwgZW5kKSB7XG4gIHZhciBzb3VyY2UgPSB0aGlzXG5cbiAgaWYgKCFzdGFydCkgc3RhcnQgPSAwXG4gIGlmICghZW5kICYmIGVuZCAhPT0gMCkgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKCF0YXJnZXRfc3RhcnQpIHRhcmdldF9zdGFydCA9IDBcblxuICAvLyBDb3B5IDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVyblxuICBpZiAodGFyZ2V0Lmxlbmd0aCA9PT0gMCB8fCBzb3VyY2UubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICAvLyBGYXRhbCBlcnJvciBjb25kaXRpb25zXG4gIGFzc2VydChlbmQgPj0gc3RhcnQsICdzb3VyY2VFbmQgPCBzb3VyY2VTdGFydCcpXG4gIGFzc2VydCh0YXJnZXRfc3RhcnQgPj0gMCAmJiB0YXJnZXRfc3RhcnQgPCB0YXJnZXQubGVuZ3RoLFxuICAgICAgJ3RhcmdldFN0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBhc3NlcnQoc3RhcnQgPj0gMCAmJiBzdGFydCA8IHNvdXJjZS5sZW5ndGgsICdzb3VyY2VTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgYXNzZXJ0KGVuZCA+PSAwICYmIGVuZCA8PSBzb3VyY2UubGVuZ3RoLCAnc291cmNlRW5kIG91dCBvZiBib3VuZHMnKVxuXG4gIC8vIEFyZSB3ZSBvb2I/XG4gIGlmIChlbmQgPiB0aGlzLmxlbmd0aClcbiAgICBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAodGFyZ2V0Lmxlbmd0aCAtIHRhcmdldF9zdGFydCA8IGVuZCAtIHN0YXJ0KVxuICAgIGVuZCA9IHRhcmdldC5sZW5ndGggLSB0YXJnZXRfc3RhcnQgKyBzdGFydFxuXG4gIHZhciBsZW4gPSBlbmQgLSBzdGFydFxuXG4gIGlmIChsZW4gPCAxMDAgfHwgIUJ1ZmZlci5fdXNlVHlwZWRBcnJheXMpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKVxuICAgICAgdGFyZ2V0W2kgKyB0YXJnZXRfc3RhcnRdID0gdGhpc1tpICsgc3RhcnRdXG4gIH0gZWxzZSB7XG4gICAgdGFyZ2V0Ll9zZXQodGhpcy5zdWJhcnJheShzdGFydCwgc3RhcnQgKyBsZW4pLCB0YXJnZXRfc3RhcnQpXG4gIH1cbn1cblxuZnVuY3Rpb24gX2Jhc2U2NFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgaWYgKHN0YXJ0ID09PSAwICYmIGVuZCA9PT0gYnVmLmxlbmd0aCkge1xuICAgIHJldHVybiBiYXNlNjQuZnJvbUJ5dGVBcnJheShidWYpXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGJhc2U2NC5mcm9tQnl0ZUFycmF5KGJ1Zi5zbGljZShzdGFydCwgZW5kKSlcbiAgfVxufVxuXG5mdW5jdGlvbiBfdXRmOFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHJlcyA9ICcnXG4gIHZhciB0bXAgPSAnJ1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBpZiAoYnVmW2ldIDw9IDB4N0YpIHtcbiAgICAgIHJlcyArPSBkZWNvZGVVdGY4Q2hhcih0bXApICsgU3RyaW5nLmZyb21DaGFyQ29kZShidWZbaV0pXG4gICAgICB0bXAgPSAnJ1xuICAgIH0gZWxzZSB7XG4gICAgICB0bXAgKz0gJyUnICsgYnVmW2ldLnRvU3RyaW5nKDE2KVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiByZXMgKyBkZWNvZGVVdGY4Q2hhcih0bXApXG59XG5cbmZ1bmN0aW9uIF9hc2NpaVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHJldCA9ICcnXG4gIGVuZCA9IE1hdGgubWluKGJ1Zi5sZW5ndGgsIGVuZClcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKylcbiAgICByZXQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShidWZbaV0pXG4gIHJldHVybiByZXRcbn1cblxuZnVuY3Rpb24gX2JpbmFyeVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgcmV0dXJuIF9hc2NpaVNsaWNlKGJ1Ziwgc3RhcnQsIGVuZClcbn1cblxuZnVuY3Rpb24gX2hleFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcblxuICBpZiAoIXN0YXJ0IHx8IHN0YXJ0IDwgMCkgc3RhcnQgPSAwXG4gIGlmICghZW5kIHx8IGVuZCA8IDAgfHwgZW5kID4gbGVuKSBlbmQgPSBsZW5cblxuICB2YXIgb3V0ID0gJydcbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBvdXQgKz0gdG9IZXgoYnVmW2ldKVxuICB9XG4gIHJldHVybiBvdXRcbn1cblxuZnVuY3Rpb24gX3V0ZjE2bGVTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciBieXRlcyA9IGJ1Zi5zbGljZShzdGFydCwgZW5kKVxuICB2YXIgcmVzID0gJydcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBieXRlcy5sZW5ndGg7IGkgKz0gMikge1xuICAgIHJlcyArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ5dGVzW2ldICsgYnl0ZXNbaSsxXSAqIDI1NilcbiAgfVxuICByZXR1cm4gcmVzXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUuc2xpY2UgPSBmdW5jdGlvbiAoc3RhcnQsIGVuZCkge1xuICB2YXIgbGVuID0gdGhpcy5sZW5ndGhcbiAgc3RhcnQgPSBjbGFtcChzdGFydCwgbGVuLCAwKVxuICBlbmQgPSBjbGFtcChlbmQsIGxlbiwgbGVuKVxuXG4gIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgcmV0dXJuIEJ1ZmZlci5fYXVnbWVudCh0aGlzLnN1YmFycmF5KHN0YXJ0LCBlbmQpKVxuICB9IGVsc2Uge1xuICAgIHZhciBzbGljZUxlbiA9IGVuZCAtIHN0YXJ0XG4gICAgdmFyIG5ld0J1ZiA9IG5ldyBCdWZmZXIoc2xpY2VMZW4sIHVuZGVmaW5lZCwgdHJ1ZSlcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNsaWNlTGVuOyBpKyspIHtcbiAgICAgIG5ld0J1ZltpXSA9IHRoaXNbaSArIHN0YXJ0XVxuICAgIH1cbiAgICByZXR1cm4gbmV3QnVmXG4gIH1cbn1cblxuLy8gYGdldGAgd2lsbCBiZSByZW1vdmVkIGluIE5vZGUgMC4xMytcbkJ1ZmZlci5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gKG9mZnNldCkge1xuICBjb25zb2xlLmxvZygnLmdldCgpIGlzIGRlcHJlY2F0ZWQuIEFjY2VzcyB1c2luZyBhcnJheSBpbmRleGVzIGluc3RlYWQuJylcbiAgcmV0dXJuIHRoaXMucmVhZFVJbnQ4KG9mZnNldClcbn1cblxuLy8gYHNldGAgd2lsbCBiZSByZW1vdmVkIGluIE5vZGUgMC4xMytcbkJ1ZmZlci5wcm90b3R5cGUuc2V0ID0gZnVuY3Rpb24gKHYsIG9mZnNldCkge1xuICBjb25zb2xlLmxvZygnLnNldCgpIGlzIGRlcHJlY2F0ZWQuIEFjY2VzcyB1c2luZyBhcnJheSBpbmRleGVzIGluc3RlYWQuJylcbiAgcmV0dXJuIHRoaXMud3JpdGVVSW50OCh2LCBvZmZzZXQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQ4ID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSB0aGlzLmxlbmd0aClcbiAgICByZXR1cm5cblxuICByZXR1cm4gdGhpc1tvZmZzZXRdXG59XG5cbmZ1bmN0aW9uIF9yZWFkVUludDE2IChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbFxuICBpZiAobGl0dGxlRW5kaWFuKSB7XG4gICAgdmFsID0gYnVmW29mZnNldF1cbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMV0gPDwgOFxuICB9IGVsc2Uge1xuICAgIHZhbCA9IGJ1ZltvZmZzZXRdIDw8IDhcbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMV1cbiAgfVxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQxNkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkVUludDE2KHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQxNkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkVUludDE2KHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZFVJbnQzMiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWxcbiAgaWYgKGxpdHRsZUVuZGlhbikge1xuICAgIGlmIChvZmZzZXQgKyAyIDwgbGVuKVxuICAgICAgdmFsID0gYnVmW29mZnNldCArIDJdIDw8IDE2XG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDFdIDw8IDhcbiAgICB2YWwgfD0gYnVmW29mZnNldF1cbiAgICBpZiAob2Zmc2V0ICsgMyA8IGxlbilcbiAgICAgIHZhbCA9IHZhbCArIChidWZbb2Zmc2V0ICsgM10gPDwgMjQgPj4+IDApXG4gIH0gZWxzZSB7XG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgPSBidWZbb2Zmc2V0ICsgMV0gPDwgMTZcbiAgICBpZiAob2Zmc2V0ICsgMiA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMl0gPDwgOFxuICAgIGlmIChvZmZzZXQgKyAzIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAzXVxuICAgIHZhbCA9IHZhbCArIChidWZbb2Zmc2V0XSA8PCAyNCA+Pj4gMClcbiAgfVxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQzMkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkVUludDMyKHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQzMkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkVUludDMyKHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQ4ID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsXG4gICAgICAgICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSB0aGlzLmxlbmd0aClcbiAgICByZXR1cm5cblxuICB2YXIgbmVnID0gdGhpc1tvZmZzZXRdICYgMHg4MFxuICBpZiAobmVnKVxuICAgIHJldHVybiAoMHhmZiAtIHRoaXNbb2Zmc2V0XSArIDEpICogLTFcbiAgZWxzZVxuICAgIHJldHVybiB0aGlzW29mZnNldF1cbn1cblxuZnVuY3Rpb24gX3JlYWRJbnQxNiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWwgPSBfcmVhZFVJbnQxNihidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCB0cnVlKVxuICB2YXIgbmVnID0gdmFsICYgMHg4MDAwXG4gIGlmIChuZWcpXG4gICAgcmV0dXJuICgweGZmZmYgLSB2YWwgKyAxKSAqIC0xXG4gIGVsc2VcbiAgICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDE2TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQxNih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQxNkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MTYodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkSW50MzIgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsID0gX3JlYWRVSW50MzIoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgdHJ1ZSlcbiAgdmFyIG5lZyA9IHZhbCAmIDB4ODAwMDAwMDBcbiAgaWYgKG5lZylcbiAgICByZXR1cm4gKDB4ZmZmZmZmZmYgLSB2YWwgKyAxKSAqIC0xXG4gIGVsc2VcbiAgICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQzMih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQzMkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MzIodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkRmxvYXQgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgcmV0dXJuIGllZWU3NTQucmVhZChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCAyMywgNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRmxvYXRMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEZsb2F0KHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRGbG9hdCh0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWREb3VibGUgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCArIDcgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgcmV0dXJuIGllZWU3NTQucmVhZChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCA1MiwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRG91YmxlTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWREb3VibGUodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRG91YmxlQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWREb3VibGUodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50OCA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ3RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZ1aW50KHZhbHVlLCAweGZmKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSB0aGlzLmxlbmd0aCkgcmV0dXJuXG5cbiAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbn1cblxuZnVuY3Rpb24gX3dyaXRlVUludDE2IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAndHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnVpbnQodmFsdWUsIDB4ZmZmZilcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGZvciAodmFyIGkgPSAwLCBqID0gTWF0aC5taW4obGVuIC0gb2Zmc2V0LCAyKTsgaSA8IGo7IGkrKykge1xuICAgIGJ1ZltvZmZzZXQgKyBpXSA9XG4gICAgICAgICh2YWx1ZSAmICgweGZmIDw8ICg4ICogKGxpdHRsZUVuZGlhbiA/IGkgOiAxIC0gaSkpKSkgPj4+XG4gICAgICAgICAgICAobGl0dGxlRW5kaWFuID8gaSA6IDEgLSBpKSAqIDhcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDE2TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDE2QkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlVUludDMyIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAndHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnVpbnQodmFsdWUsIDB4ZmZmZmZmZmYpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBmb3IgKHZhciBpID0gMCwgaiA9IE1hdGgubWluKGxlbiAtIG9mZnNldCwgNCk7IGkgPCBqOyBpKyspIHtcbiAgICBidWZbb2Zmc2V0ICsgaV0gPVxuICAgICAgICAodmFsdWUgPj4+IChsaXR0bGVFbmRpYW4gPyBpIDogMyAtIGkpICogOCkgJiAweGZmXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQzMkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQzMkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQ4ID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnNpbnQodmFsdWUsIDB4N2YsIC0weDgwKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSB0aGlzLmxlbmd0aClcbiAgICByZXR1cm5cblxuICBpZiAodmFsdWUgPj0gMClcbiAgICB0aGlzLndyaXRlVUludDgodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpXG4gIGVsc2VcbiAgICB0aGlzLndyaXRlVUludDgoMHhmZiArIHZhbHVlICsgMSwgb2Zmc2V0LCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlSW50MTYgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmc2ludCh2YWx1ZSwgMHg3ZmZmLCAtMHg4MDAwKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWYgKHZhbHVlID49IDApXG4gICAgX3dyaXRlVUludDE2KGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbiAgZWxzZVxuICAgIF93cml0ZVVJbnQxNihidWYsIDB4ZmZmZiArIHZhbHVlICsgMSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDE2QkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVJbnQzMiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZzaW50KHZhbHVlLCAweDdmZmZmZmZmLCAtMHg4MDAwMDAwMClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGlmICh2YWx1ZSA+PSAwKVxuICAgIF93cml0ZVVJbnQzMihidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG4gIGVsc2VcbiAgICBfd3JpdGVVSW50MzIoYnVmLCAweGZmZmZmZmZmICsgdmFsdWUgKyAxLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQzMkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MzJCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZUZsb2F0IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZklFRUU3NTQodmFsdWUsIDMuNDAyODIzNDY2Mzg1Mjg4NmUrMzgsIC0zLjQwMjgyMzQ2NjM4NTI4ODZlKzM4KVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWVlZTc1NC53cml0ZShidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgMjMsIDQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdExFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUZsb2F0KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRmxvYXRCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVGbG9hdCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZURvdWJsZSAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyA3IDwgYnVmLmxlbmd0aCxcbiAgICAgICAgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZJRUVFNzU0KHZhbHVlLCAxLjc5NzY5MzEzNDg2MjMxNTdFKzMwOCwgLTEuNzk3NjkzMTM0ODYyMzE1N0UrMzA4KVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWVlZTc1NC53cml0ZShidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgNTIsIDgpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVEb3VibGVMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVEb3VibGUodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVEb3VibGVCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVEb3VibGUodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG4vLyBmaWxsKHZhbHVlLCBzdGFydD0wLCBlbmQ9YnVmZmVyLmxlbmd0aClcbkJ1ZmZlci5wcm90b3R5cGUuZmlsbCA9IGZ1bmN0aW9uICh2YWx1ZSwgc3RhcnQsIGVuZCkge1xuICBpZiAoIXZhbHVlKSB2YWx1ZSA9IDBcbiAgaWYgKCFzdGFydCkgc3RhcnQgPSAwXG4gIGlmICghZW5kKSBlbmQgPSB0aGlzLmxlbmd0aFxuXG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgdmFsdWUgPSB2YWx1ZS5jaGFyQ29kZUF0KDApXG4gIH1cblxuICBhc3NlcnQodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJiAhaXNOYU4odmFsdWUpLCAndmFsdWUgaXMgbm90IGEgbnVtYmVyJylcbiAgYXNzZXJ0KGVuZCA+PSBzdGFydCwgJ2VuZCA8IHN0YXJ0JylcblxuICAvLyBGaWxsIDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVyblxuICBpZiAodGhpcy5sZW5ndGggPT09IDApIHJldHVyblxuXG4gIGFzc2VydChzdGFydCA+PSAwICYmIHN0YXJ0IDwgdGhpcy5sZW5ndGgsICdzdGFydCBvdXQgb2YgYm91bmRzJylcbiAgYXNzZXJ0KGVuZCA+PSAwICYmIGVuZCA8PSB0aGlzLmxlbmd0aCwgJ2VuZCBvdXQgb2YgYm91bmRzJylcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIHRoaXNbaV0gPSB2YWx1ZVxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUuaW5zcGVjdCA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIG91dCA9IFtdXG4gIHZhciBsZW4gPSB0aGlzLmxlbmd0aFxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgb3V0W2ldID0gdG9IZXgodGhpc1tpXSlcbiAgICBpZiAoaSA9PT0gZXhwb3J0cy5JTlNQRUNUX01BWF9CWVRFUykge1xuICAgICAgb3V0W2kgKyAxXSA9ICcuLi4nXG4gICAgICBicmVha1xuICAgIH1cbiAgfVxuICByZXR1cm4gJzxCdWZmZXIgJyArIG91dC5qb2luKCcgJykgKyAnPidcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGBBcnJheUJ1ZmZlcmAgd2l0aCB0aGUgKmNvcGllZCogbWVtb3J5IG9mIHRoZSBidWZmZXIgaW5zdGFuY2UuXG4gKiBBZGRlZCBpbiBOb2RlIDAuMTIuIE9ubHkgYXZhaWxhYmxlIGluIGJyb3dzZXJzIHRoYXQgc3VwcG9ydCBBcnJheUJ1ZmZlci5cbiAqL1xuQnVmZmVyLnByb3RvdHlwZS50b0FycmF5QnVmZmVyID0gZnVuY3Rpb24gKCkge1xuICBpZiAodHlwZW9mIFVpbnQ4QXJyYXkgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMpIHtcbiAgICAgIHJldHVybiAobmV3IEJ1ZmZlcih0aGlzKSkuYnVmZmVyXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBidWYgPSBuZXcgVWludDhBcnJheSh0aGlzLmxlbmd0aClcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBidWYubGVuZ3RoOyBpIDwgbGVuOyBpICs9IDEpXG4gICAgICAgIGJ1ZltpXSA9IHRoaXNbaV1cbiAgICAgIHJldHVybiBidWYuYnVmZmVyXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBFcnJvcignQnVmZmVyLnRvQXJyYXlCdWZmZXIgbm90IHN1cHBvcnRlZCBpbiB0aGlzIGJyb3dzZXInKVxuICB9XG59XG5cbi8vIEhFTFBFUiBGVU5DVElPTlNcbi8vID09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gc3RyaW5ndHJpbSAoc3RyKSB7XG4gIGlmIChzdHIudHJpbSkgcmV0dXJuIHN0ci50cmltKClcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9eXFxzK3xcXHMrJC9nLCAnJylcbn1cblxudmFyIEJQID0gQnVmZmVyLnByb3RvdHlwZVxuXG4vKipcbiAqIEF1Z21lbnQgYSBVaW50OEFycmF5ICppbnN0YW5jZSogKG5vdCB0aGUgVWludDhBcnJheSBjbGFzcyEpIHdpdGggQnVmZmVyIG1ldGhvZHNcbiAqL1xuQnVmZmVyLl9hdWdtZW50ID0gZnVuY3Rpb24gKGFycikge1xuICBhcnIuX2lzQnVmZmVyID0gdHJ1ZVxuXG4gIC8vIHNhdmUgcmVmZXJlbmNlIHRvIG9yaWdpbmFsIFVpbnQ4QXJyYXkgZ2V0L3NldCBtZXRob2RzIGJlZm9yZSBvdmVyd3JpdGluZ1xuICBhcnIuX2dldCA9IGFyci5nZXRcbiAgYXJyLl9zZXQgPSBhcnIuc2V0XG5cbiAgLy8gZGVwcmVjYXRlZCwgd2lsbCBiZSByZW1vdmVkIGluIG5vZGUgMC4xMytcbiAgYXJyLmdldCA9IEJQLmdldFxuICBhcnIuc2V0ID0gQlAuc2V0XG5cbiAgYXJyLndyaXRlID0gQlAud3JpdGVcbiAgYXJyLnRvU3RyaW5nID0gQlAudG9TdHJpbmdcbiAgYXJyLnRvTG9jYWxlU3RyaW5nID0gQlAudG9TdHJpbmdcbiAgYXJyLnRvSlNPTiA9IEJQLnRvSlNPTlxuICBhcnIuY29weSA9IEJQLmNvcHlcbiAgYXJyLnNsaWNlID0gQlAuc2xpY2VcbiAgYXJyLnJlYWRVSW50OCA9IEJQLnJlYWRVSW50OFxuICBhcnIucmVhZFVJbnQxNkxFID0gQlAucmVhZFVJbnQxNkxFXG4gIGFyci5yZWFkVUludDE2QkUgPSBCUC5yZWFkVUludDE2QkVcbiAgYXJyLnJlYWRVSW50MzJMRSA9IEJQLnJlYWRVSW50MzJMRVxuICBhcnIucmVhZFVJbnQzMkJFID0gQlAucmVhZFVJbnQzMkJFXG4gIGFyci5yZWFkSW50OCA9IEJQLnJlYWRJbnQ4XG4gIGFyci5yZWFkSW50MTZMRSA9IEJQLnJlYWRJbnQxNkxFXG4gIGFyci5yZWFkSW50MTZCRSA9IEJQLnJlYWRJbnQxNkJFXG4gIGFyci5yZWFkSW50MzJMRSA9IEJQLnJlYWRJbnQzMkxFXG4gIGFyci5yZWFkSW50MzJCRSA9IEJQLnJlYWRJbnQzMkJFXG4gIGFyci5yZWFkRmxvYXRMRSA9IEJQLnJlYWRGbG9hdExFXG4gIGFyci5yZWFkRmxvYXRCRSA9IEJQLnJlYWRGbG9hdEJFXG4gIGFyci5yZWFkRG91YmxlTEUgPSBCUC5yZWFkRG91YmxlTEVcbiAgYXJyLnJlYWREb3VibGVCRSA9IEJQLnJlYWREb3VibGVCRVxuICBhcnIud3JpdGVVSW50OCA9IEJQLndyaXRlVUludDhcbiAgYXJyLndyaXRlVUludDE2TEUgPSBCUC53cml0ZVVJbnQxNkxFXG4gIGFyci53cml0ZVVJbnQxNkJFID0gQlAud3JpdGVVSW50MTZCRVxuICBhcnIud3JpdGVVSW50MzJMRSA9IEJQLndyaXRlVUludDMyTEVcbiAgYXJyLndyaXRlVUludDMyQkUgPSBCUC53cml0ZVVJbnQzMkJFXG4gIGFyci53cml0ZUludDggPSBCUC53cml0ZUludDhcbiAgYXJyLndyaXRlSW50MTZMRSA9IEJQLndyaXRlSW50MTZMRVxuICBhcnIud3JpdGVJbnQxNkJFID0gQlAud3JpdGVJbnQxNkJFXG4gIGFyci53cml0ZUludDMyTEUgPSBCUC53cml0ZUludDMyTEVcbiAgYXJyLndyaXRlSW50MzJCRSA9IEJQLndyaXRlSW50MzJCRVxuICBhcnIud3JpdGVGbG9hdExFID0gQlAud3JpdGVGbG9hdExFXG4gIGFyci53cml0ZUZsb2F0QkUgPSBCUC53cml0ZUZsb2F0QkVcbiAgYXJyLndyaXRlRG91YmxlTEUgPSBCUC53cml0ZURvdWJsZUxFXG4gIGFyci53cml0ZURvdWJsZUJFID0gQlAud3JpdGVEb3VibGVCRVxuICBhcnIuZmlsbCA9IEJQLmZpbGxcbiAgYXJyLmluc3BlY3QgPSBCUC5pbnNwZWN0XG4gIGFyci50b0FycmF5QnVmZmVyID0gQlAudG9BcnJheUJ1ZmZlclxuXG4gIHJldHVybiBhcnJcbn1cblxuLy8gc2xpY2Uoc3RhcnQsIGVuZClcbmZ1bmN0aW9uIGNsYW1wIChpbmRleCwgbGVuLCBkZWZhdWx0VmFsdWUpIHtcbiAgaWYgKHR5cGVvZiBpbmRleCAhPT0gJ251bWJlcicpIHJldHVybiBkZWZhdWx0VmFsdWVcbiAgaW5kZXggPSB+fmluZGV4OyAgLy8gQ29lcmNlIHRvIGludGVnZXIuXG4gIGlmIChpbmRleCA+PSBsZW4pIHJldHVybiBsZW5cbiAgaWYgKGluZGV4ID49IDApIHJldHVybiBpbmRleFxuICBpbmRleCArPSBsZW5cbiAgaWYgKGluZGV4ID49IDApIHJldHVybiBpbmRleFxuICByZXR1cm4gMFxufVxuXG5mdW5jdGlvbiBjb2VyY2UgKGxlbmd0aCkge1xuICAvLyBDb2VyY2UgbGVuZ3RoIHRvIGEgbnVtYmVyIChwb3NzaWJseSBOYU4pLCByb3VuZCB1cFxuICAvLyBpbiBjYXNlIGl0J3MgZnJhY3Rpb25hbCAoZS5nLiAxMjMuNDU2KSB0aGVuIGRvIGFcbiAgLy8gZG91YmxlIG5lZ2F0ZSB0byBjb2VyY2UgYSBOYU4gdG8gMC4gRWFzeSwgcmlnaHQ/XG4gIGxlbmd0aCA9IH5+TWF0aC5jZWlsKCtsZW5ndGgpXG4gIHJldHVybiBsZW5ndGggPCAwID8gMCA6IGxlbmd0aFxufVxuXG5mdW5jdGlvbiBpc0FycmF5IChzdWJqZWN0KSB7XG4gIHJldHVybiAoQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoc3ViamVjdCkge1xuICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoc3ViamVjdCkgPT09ICdbb2JqZWN0IEFycmF5XSdcbiAgfSkoc3ViamVjdClcbn1cblxuZnVuY3Rpb24gaXNBcnJheWlzaCAoc3ViamVjdCkge1xuICByZXR1cm4gaXNBcnJheShzdWJqZWN0KSB8fCBCdWZmZXIuaXNCdWZmZXIoc3ViamVjdCkgfHxcbiAgICAgIHN1YmplY3QgJiYgdHlwZW9mIHN1YmplY3QgPT09ICdvYmplY3QnICYmXG4gICAgICB0eXBlb2Ygc3ViamVjdC5sZW5ndGggPT09ICdudW1iZXInXG59XG5cbmZ1bmN0aW9uIHRvSGV4IChuKSB7XG4gIGlmIChuIDwgMTYpIHJldHVybiAnMCcgKyBuLnRvU3RyaW5nKDE2KVxuICByZXR1cm4gbi50b1N0cmluZygxNilcbn1cblxuZnVuY3Rpb24gdXRmOFRvQnl0ZXMgKHN0cikge1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgYiA9IHN0ci5jaGFyQ29kZUF0KGkpXG4gICAgaWYgKGIgPD0gMHg3RilcbiAgICAgIGJ5dGVBcnJheS5wdXNoKHN0ci5jaGFyQ29kZUF0KGkpKVxuICAgIGVsc2Uge1xuICAgICAgdmFyIHN0YXJ0ID0gaVxuICAgICAgaWYgKGIgPj0gMHhEODAwICYmIGIgPD0gMHhERkZGKSBpKytcbiAgICAgIHZhciBoID0gZW5jb2RlVVJJQ29tcG9uZW50KHN0ci5zbGljZShzdGFydCwgaSsxKSkuc3Vic3RyKDEpLnNwbGl0KCclJylcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaC5sZW5ndGg7IGorKylcbiAgICAgICAgYnl0ZUFycmF5LnB1c2gocGFyc2VJbnQoaFtqXSwgMTYpKVxuICAgIH1cbiAgfVxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIGFzY2lpVG9CeXRlcyAoc3RyKSB7XG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIC8vIE5vZGUncyBjb2RlIHNlZW1zIHRvIGJlIGRvaW5nIHRoaXMgYW5kIG5vdCAmIDB4N0YuLlxuICAgIGJ5dGVBcnJheS5wdXNoKHN0ci5jaGFyQ29kZUF0KGkpICYgMHhGRilcbiAgfVxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIHV0ZjE2bGVUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGMsIGhpLCBsb1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICBjID0gc3RyLmNoYXJDb2RlQXQoaSlcbiAgICBoaSA9IGMgPj4gOFxuICAgIGxvID0gYyAlIDI1NlxuICAgIGJ5dGVBcnJheS5wdXNoKGxvKVxuICAgIGJ5dGVBcnJheS5wdXNoKGhpKVxuICB9XG5cbiAgcmV0dXJuIGJ5dGVBcnJheVxufVxuXG5mdW5jdGlvbiBiYXNlNjRUb0J5dGVzIChzdHIpIHtcbiAgcmV0dXJuIGJhc2U2NC50b0J5dGVBcnJheShzdHIpXG59XG5cbmZ1bmN0aW9uIGJsaXRCdWZmZXIgKHNyYywgZHN0LCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgcG9zXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoKGkgKyBvZmZzZXQgPj0gZHN0Lmxlbmd0aCkgfHwgKGkgPj0gc3JjLmxlbmd0aCkpXG4gICAgICBicmVha1xuICAgIGRzdFtpICsgb2Zmc2V0XSA9IHNyY1tpXVxuICB9XG4gIHJldHVybiBpXG59XG5cbmZ1bmN0aW9uIGRlY29kZVV0ZjhDaGFyIChzdHIpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KHN0cilcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUoMHhGRkZEKSAvLyBVVEYgOCBpbnZhbGlkIGNoYXJcbiAgfVxufVxuXG4vKlxuICogV2UgaGF2ZSB0byBtYWtlIHN1cmUgdGhhdCB0aGUgdmFsdWUgaXMgYSB2YWxpZCBpbnRlZ2VyLiBUaGlzIG1lYW5zIHRoYXQgaXRcbiAqIGlzIG5vbi1uZWdhdGl2ZS4gSXQgaGFzIG5vIGZyYWN0aW9uYWwgY29tcG9uZW50IGFuZCB0aGF0IGl0IGRvZXMgbm90XG4gKiBleGNlZWQgdGhlIG1heGltdW0gYWxsb3dlZCB2YWx1ZS5cbiAqL1xuZnVuY3Rpb24gdmVyaWZ1aW50ICh2YWx1ZSwgbWF4KSB7XG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInLCAnY2Fubm90IHdyaXRlIGEgbm9uLW51bWJlciBhcyBhIG51bWJlcicpXG4gIGFzc2VydCh2YWx1ZSA+PSAwLCAnc3BlY2lmaWVkIGEgbmVnYXRpdmUgdmFsdWUgZm9yIHdyaXRpbmcgYW4gdW5zaWduZWQgdmFsdWUnKVxuICBhc3NlcnQodmFsdWUgPD0gbWF4LCAndmFsdWUgaXMgbGFyZ2VyIHRoYW4gbWF4aW11bSB2YWx1ZSBmb3IgdHlwZScpXG4gIGFzc2VydChNYXRoLmZsb29yKHZhbHVlKSA9PT0gdmFsdWUsICd2YWx1ZSBoYXMgYSBmcmFjdGlvbmFsIGNvbXBvbmVudCcpXG59XG5cbmZ1bmN0aW9uIHZlcmlmc2ludCAodmFsdWUsIG1heCwgbWluKSB7XG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInLCAnY2Fubm90IHdyaXRlIGEgbm9uLW51bWJlciBhcyBhIG51bWJlcicpXG4gIGFzc2VydCh2YWx1ZSA8PSBtYXgsICd2YWx1ZSBsYXJnZXIgdGhhbiBtYXhpbXVtIGFsbG93ZWQgdmFsdWUnKVxuICBhc3NlcnQodmFsdWUgPj0gbWluLCAndmFsdWUgc21hbGxlciB0aGFuIG1pbmltdW0gYWxsb3dlZCB2YWx1ZScpXG4gIGFzc2VydChNYXRoLmZsb29yKHZhbHVlKSA9PT0gdmFsdWUsICd2YWx1ZSBoYXMgYSBmcmFjdGlvbmFsIGNvbXBvbmVudCcpXG59XG5cbmZ1bmN0aW9uIHZlcmlmSUVFRTc1NCAodmFsdWUsIG1heCwgbWluKSB7XG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInLCAnY2Fubm90IHdyaXRlIGEgbm9uLW51bWJlciBhcyBhIG51bWJlcicpXG4gIGFzc2VydCh2YWx1ZSA8PSBtYXgsICd2YWx1ZSBsYXJnZXIgdGhhbiBtYXhpbXVtIGFsbG93ZWQgdmFsdWUnKVxuICBhc3NlcnQodmFsdWUgPj0gbWluLCAndmFsdWUgc21hbGxlciB0aGFuIG1pbmltdW0gYWxsb3dlZCB2YWx1ZScpXG59XG5cbmZ1bmN0aW9uIGFzc2VydCAodGVzdCwgbWVzc2FnZSkge1xuICBpZiAoIXRlc3QpIHRocm93IG5ldyBFcnJvcihtZXNzYWdlIHx8ICdGYWlsZWQgYXNzZXJ0aW9uJylcbn1cblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIxWWlaNVNcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvaW5kZXguanNcIixcIi8uLi9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXJcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgbG9va3VwID0gJ0FCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky8nO1xuXG47KGZ1bmN0aW9uIChleHBvcnRzKSB7XG5cdCd1c2Ugc3RyaWN0JztcblxuICB2YXIgQXJyID0gKHR5cGVvZiBVaW50OEFycmF5ICE9PSAndW5kZWZpbmVkJylcbiAgICA/IFVpbnQ4QXJyYXlcbiAgICA6IEFycmF5XG5cblx0dmFyIFBMVVMgICA9ICcrJy5jaGFyQ29kZUF0KDApXG5cdHZhciBTTEFTSCAgPSAnLycuY2hhckNvZGVBdCgwKVxuXHR2YXIgTlVNQkVSID0gJzAnLmNoYXJDb2RlQXQoMClcblx0dmFyIExPV0VSICA9ICdhJy5jaGFyQ29kZUF0KDApXG5cdHZhciBVUFBFUiAgPSAnQScuY2hhckNvZGVBdCgwKVxuXG5cdGZ1bmN0aW9uIGRlY29kZSAoZWx0KSB7XG5cdFx0dmFyIGNvZGUgPSBlbHQuY2hhckNvZGVBdCgwKVxuXHRcdGlmIChjb2RlID09PSBQTFVTKVxuXHRcdFx0cmV0dXJuIDYyIC8vICcrJ1xuXHRcdGlmIChjb2RlID09PSBTTEFTSClcblx0XHRcdHJldHVybiA2MyAvLyAnLydcblx0XHRpZiAoY29kZSA8IE5VTUJFUilcblx0XHRcdHJldHVybiAtMSAvL25vIG1hdGNoXG5cdFx0aWYgKGNvZGUgPCBOVU1CRVIgKyAxMClcblx0XHRcdHJldHVybiBjb2RlIC0gTlVNQkVSICsgMjYgKyAyNlxuXHRcdGlmIChjb2RlIDwgVVBQRVIgKyAyNilcblx0XHRcdHJldHVybiBjb2RlIC0gVVBQRVJcblx0XHRpZiAoY29kZSA8IExPV0VSICsgMjYpXG5cdFx0XHRyZXR1cm4gY29kZSAtIExPV0VSICsgMjZcblx0fVxuXG5cdGZ1bmN0aW9uIGI2NFRvQnl0ZUFycmF5IChiNjQpIHtcblx0XHR2YXIgaSwgaiwgbCwgdG1wLCBwbGFjZUhvbGRlcnMsIGFyclxuXG5cdFx0aWYgKGI2NC5sZW5ndGggJSA0ID4gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHN0cmluZy4gTGVuZ3RoIG11c3QgYmUgYSBtdWx0aXBsZSBvZiA0Jylcblx0XHR9XG5cblx0XHQvLyB0aGUgbnVtYmVyIG9mIGVxdWFsIHNpZ25zIChwbGFjZSBob2xkZXJzKVxuXHRcdC8vIGlmIHRoZXJlIGFyZSB0d28gcGxhY2Vob2xkZXJzLCB0aGFuIHRoZSB0d28gY2hhcmFjdGVycyBiZWZvcmUgaXRcblx0XHQvLyByZXByZXNlbnQgb25lIGJ5dGVcblx0XHQvLyBpZiB0aGVyZSBpcyBvbmx5IG9uZSwgdGhlbiB0aGUgdGhyZWUgY2hhcmFjdGVycyBiZWZvcmUgaXQgcmVwcmVzZW50IDIgYnl0ZXNcblx0XHQvLyB0aGlzIGlzIGp1c3QgYSBjaGVhcCBoYWNrIHRvIG5vdCBkbyBpbmRleE9mIHR3aWNlXG5cdFx0dmFyIGxlbiA9IGI2NC5sZW5ndGhcblx0XHRwbGFjZUhvbGRlcnMgPSAnPScgPT09IGI2NC5jaGFyQXQobGVuIC0gMikgPyAyIDogJz0nID09PSBiNjQuY2hhckF0KGxlbiAtIDEpID8gMSA6IDBcblxuXHRcdC8vIGJhc2U2NCBpcyA0LzMgKyB1cCB0byB0d28gY2hhcmFjdGVycyBvZiB0aGUgb3JpZ2luYWwgZGF0YVxuXHRcdGFyciA9IG5ldyBBcnIoYjY0Lmxlbmd0aCAqIDMgLyA0IC0gcGxhY2VIb2xkZXJzKVxuXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHBsYWNlaG9sZGVycywgb25seSBnZXQgdXAgdG8gdGhlIGxhc3QgY29tcGxldGUgNCBjaGFyc1xuXHRcdGwgPSBwbGFjZUhvbGRlcnMgPiAwID8gYjY0Lmxlbmd0aCAtIDQgOiBiNjQubGVuZ3RoXG5cblx0XHR2YXIgTCA9IDBcblxuXHRcdGZ1bmN0aW9uIHB1c2ggKHYpIHtcblx0XHRcdGFycltMKytdID0gdlxuXHRcdH1cblxuXHRcdGZvciAoaSA9IDAsIGogPSAwOyBpIDwgbDsgaSArPSA0LCBqICs9IDMpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMTgpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPDwgMTIpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAyKSkgPDwgNikgfCBkZWNvZGUoYjY0LmNoYXJBdChpICsgMykpXG5cdFx0XHRwdXNoKCh0bXAgJiAweEZGMDAwMCkgPj4gMTYpXG5cdFx0XHRwdXNoKCh0bXAgJiAweEZGMDApID4+IDgpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fVxuXG5cdFx0aWYgKHBsYWNlSG9sZGVycyA9PT0gMikge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAyKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpID4+IDQpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fSBlbHNlIGlmIChwbGFjZUhvbGRlcnMgPT09IDEpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMTApIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPDwgNCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDIpKSA+PiAyKVxuXHRcdFx0cHVzaCgodG1wID4+IDgpICYgMHhGRilcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9XG5cblx0XHRyZXR1cm4gYXJyXG5cdH1cblxuXHRmdW5jdGlvbiB1aW50OFRvQmFzZTY0ICh1aW50OCkge1xuXHRcdHZhciBpLFxuXHRcdFx0ZXh0cmFCeXRlcyA9IHVpbnQ4Lmxlbmd0aCAlIDMsIC8vIGlmIHdlIGhhdmUgMSBieXRlIGxlZnQsIHBhZCAyIGJ5dGVzXG5cdFx0XHRvdXRwdXQgPSBcIlwiLFxuXHRcdFx0dGVtcCwgbGVuZ3RoXG5cblx0XHRmdW5jdGlvbiBlbmNvZGUgKG51bSkge1xuXHRcdFx0cmV0dXJuIGxvb2t1cC5jaGFyQXQobnVtKVxuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHRyaXBsZXRUb0Jhc2U2NCAobnVtKSB7XG5cdFx0XHRyZXR1cm4gZW5jb2RlKG51bSA+PiAxOCAmIDB4M0YpICsgZW5jb2RlKG51bSA+PiAxMiAmIDB4M0YpICsgZW5jb2RlKG51bSA+PiA2ICYgMHgzRikgKyBlbmNvZGUobnVtICYgMHgzRilcblx0XHR9XG5cblx0XHQvLyBnbyB0aHJvdWdoIHRoZSBhcnJheSBldmVyeSB0aHJlZSBieXRlcywgd2UnbGwgZGVhbCB3aXRoIHRyYWlsaW5nIHN0dWZmIGxhdGVyXG5cdFx0Zm9yIChpID0gMCwgbGVuZ3RoID0gdWludDgubGVuZ3RoIC0gZXh0cmFCeXRlczsgaSA8IGxlbmd0aDsgaSArPSAzKSB7XG5cdFx0XHR0ZW1wID0gKHVpbnQ4W2ldIDw8IDE2KSArICh1aW50OFtpICsgMV0gPDwgOCkgKyAodWludDhbaSArIDJdKVxuXHRcdFx0b3V0cHV0ICs9IHRyaXBsZXRUb0Jhc2U2NCh0ZW1wKVxuXHRcdH1cblxuXHRcdC8vIHBhZCB0aGUgZW5kIHdpdGggemVyb3MsIGJ1dCBtYWtlIHN1cmUgdG8gbm90IGZvcmdldCB0aGUgZXh0cmEgYnl0ZXNcblx0XHRzd2l0Y2ggKGV4dHJhQnl0ZXMpIHtcblx0XHRcdGNhc2UgMTpcblx0XHRcdFx0dGVtcCA9IHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDFdXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUodGVtcCA+PiAyKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wIDw8IDQpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9ICc9PSdcblx0XHRcdFx0YnJlYWtcblx0XHRcdGNhc2UgMjpcblx0XHRcdFx0dGVtcCA9ICh1aW50OFt1aW50OC5sZW5ndGggLSAyXSA8PCA4KSArICh1aW50OFt1aW50OC5sZW5ndGggLSAxXSlcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSh0ZW1wID4+IDEwKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wID4+IDQpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA8PCAyKSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSAnPSdcblx0XHRcdFx0YnJlYWtcblx0XHR9XG5cblx0XHRyZXR1cm4gb3V0cHV0XG5cdH1cblxuXHRleHBvcnRzLnRvQnl0ZUFycmF5ID0gYjY0VG9CeXRlQXJyYXlcblx0ZXhwb3J0cy5mcm9tQnl0ZUFycmF5ID0gdWludDhUb0Jhc2U2NFxufSh0eXBlb2YgZXhwb3J0cyA9PT0gJ3VuZGVmaW5lZCcgPyAodGhpcy5iYXNlNjRqcyA9IHt9KSA6IGV4cG9ydHMpKVxuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvYmFzZTY0LWpzL2xpYi9iNjQuanNcIixcIi8uLi9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvbm9kZV9tb2R1bGVzL2Jhc2U2NC1qcy9saWJcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5leHBvcnRzLnJlYWQgPSBmdW5jdGlvbihidWZmZXIsIG9mZnNldCwgaXNMRSwgbUxlbiwgbkJ5dGVzKSB7XG4gIHZhciBlLCBtLFxuICAgICAgZUxlbiA9IG5CeXRlcyAqIDggLSBtTGVuIC0gMSxcbiAgICAgIGVNYXggPSAoMSA8PCBlTGVuKSAtIDEsXG4gICAgICBlQmlhcyA9IGVNYXggPj4gMSxcbiAgICAgIG5CaXRzID0gLTcsXG4gICAgICBpID0gaXNMRSA/IChuQnl0ZXMgLSAxKSA6IDAsXG4gICAgICBkID0gaXNMRSA/IC0xIDogMSxcbiAgICAgIHMgPSBidWZmZXJbb2Zmc2V0ICsgaV07XG5cbiAgaSArPSBkO1xuXG4gIGUgPSBzICYgKCgxIDw8ICgtbkJpdHMpKSAtIDEpO1xuICBzID4+PSAoLW5CaXRzKTtcbiAgbkJpdHMgKz0gZUxlbjtcbiAgZm9yICg7IG5CaXRzID4gMDsgZSA9IGUgKiAyNTYgKyBidWZmZXJbb2Zmc2V0ICsgaV0sIGkgKz0gZCwgbkJpdHMgLT0gOCk7XG5cbiAgbSA9IGUgJiAoKDEgPDwgKC1uQml0cykpIC0gMSk7XG4gIGUgPj49ICgtbkJpdHMpO1xuICBuQml0cyArPSBtTGVuO1xuICBmb3IgKDsgbkJpdHMgPiAwOyBtID0gbSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KTtcblxuICBpZiAoZSA9PT0gMCkge1xuICAgIGUgPSAxIC0gZUJpYXM7XG4gIH0gZWxzZSBpZiAoZSA9PT0gZU1heCkge1xuICAgIHJldHVybiBtID8gTmFOIDogKChzID8gLTEgOiAxKSAqIEluZmluaXR5KTtcbiAgfSBlbHNlIHtcbiAgICBtID0gbSArIE1hdGgucG93KDIsIG1MZW4pO1xuICAgIGUgPSBlIC0gZUJpYXM7XG4gIH1cbiAgcmV0dXJuIChzID8gLTEgOiAxKSAqIG0gKiBNYXRoLnBvdygyLCBlIC0gbUxlbik7XG59O1xuXG5leHBvcnRzLndyaXRlID0gZnVuY3Rpb24oYnVmZmVyLCB2YWx1ZSwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG0sIGMsXG4gICAgICBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxLFxuICAgICAgZU1heCA9ICgxIDw8IGVMZW4pIC0gMSxcbiAgICAgIGVCaWFzID0gZU1heCA+PiAxLFxuICAgICAgcnQgPSAobUxlbiA9PT0gMjMgPyBNYXRoLnBvdygyLCAtMjQpIC0gTWF0aC5wb3coMiwgLTc3KSA6IDApLFxuICAgICAgaSA9IGlzTEUgPyAwIDogKG5CeXRlcyAtIDEpLFxuICAgICAgZCA9IGlzTEUgPyAxIDogLTEsXG4gICAgICBzID0gdmFsdWUgPCAwIHx8ICh2YWx1ZSA9PT0gMCAmJiAxIC8gdmFsdWUgPCAwKSA/IDEgOiAwO1xuXG4gIHZhbHVlID0gTWF0aC5hYnModmFsdWUpO1xuXG4gIGlmIChpc05hTih2YWx1ZSkgfHwgdmFsdWUgPT09IEluZmluaXR5KSB7XG4gICAgbSA9IGlzTmFOKHZhbHVlKSA/IDEgOiAwO1xuICAgIGUgPSBlTWF4O1xuICB9IGVsc2Uge1xuICAgIGUgPSBNYXRoLmZsb29yKE1hdGgubG9nKHZhbHVlKSAvIE1hdGguTE4yKTtcbiAgICBpZiAodmFsdWUgKiAoYyA9IE1hdGgucG93KDIsIC1lKSkgPCAxKSB7XG4gICAgICBlLS07XG4gICAgICBjICo9IDI7XG4gICAgfVxuICAgIGlmIChlICsgZUJpYXMgPj0gMSkge1xuICAgICAgdmFsdWUgKz0gcnQgLyBjO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YWx1ZSArPSBydCAqIE1hdGgucG93KDIsIDEgLSBlQmlhcyk7XG4gICAgfVxuICAgIGlmICh2YWx1ZSAqIGMgPj0gMikge1xuICAgICAgZSsrO1xuICAgICAgYyAvPSAyO1xuICAgIH1cblxuICAgIGlmIChlICsgZUJpYXMgPj0gZU1heCkge1xuICAgICAgbSA9IDA7XG4gICAgICBlID0gZU1heDtcbiAgICB9IGVsc2UgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICBtID0gKHZhbHVlICogYyAtIDEpICogTWF0aC5wb3coMiwgbUxlbik7XG4gICAgICBlID0gZSArIGVCaWFzO1xuICAgIH0gZWxzZSB7XG4gICAgICBtID0gdmFsdWUgKiBNYXRoLnBvdygyLCBlQmlhcyAtIDEpICogTWF0aC5wb3coMiwgbUxlbik7XG4gICAgICBlID0gMDtcbiAgICB9XG4gIH1cblxuICBmb3IgKDsgbUxlbiA+PSA4OyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBtICYgMHhmZiwgaSArPSBkLCBtIC89IDI1NiwgbUxlbiAtPSA4KTtcblxuICBlID0gKGUgPDwgbUxlbikgfCBtO1xuICBlTGVuICs9IG1MZW47XG4gIGZvciAoOyBlTGVuID4gMDsgYnVmZmVyW29mZnNldCArIGldID0gZSAmIDB4ZmYsIGkgKz0gZCwgZSAvPSAyNTYsIGVMZW4gLT0gOCk7XG5cbiAgYnVmZmVyW29mZnNldCArIGkgLSBkXSB8PSBzICogMTI4O1xufTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIxWWlaNVNcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvbm9kZV9tb2R1bGVzL2llZWU3NTQvaW5kZXguanNcIixcIi8uLi9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvbm9kZV9tb2R1bGVzL2llZWU3NTRcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG4vLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcblxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG5wcm9jZXNzLm5leHRUaWNrID0gKGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgY2FuU2V0SW1tZWRpYXRlID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAmJiB3aW5kb3cuc2V0SW1tZWRpYXRlO1xuICAgIHZhciBjYW5Qb3N0ID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAmJiB3aW5kb3cucG9zdE1lc3NhZ2UgJiYgd2luZG93LmFkZEV2ZW50TGlzdGVuZXJcbiAgICA7XG5cbiAgICBpZiAoY2FuU2V0SW1tZWRpYXRlKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoZikgeyByZXR1cm4gd2luZG93LnNldEltbWVkaWF0ZShmKSB9O1xuICAgIH1cblxuICAgIGlmIChjYW5Qb3N0KSB7XG4gICAgICAgIHZhciBxdWV1ZSA9IFtdO1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGZ1bmN0aW9uIChldikge1xuICAgICAgICAgICAgdmFyIHNvdXJjZSA9IGV2LnNvdXJjZTtcbiAgICAgICAgICAgIGlmICgoc291cmNlID09PSB3aW5kb3cgfHwgc291cmNlID09PSBudWxsKSAmJiBldi5kYXRhID09PSAncHJvY2Vzcy10aWNrJykge1xuICAgICAgICAgICAgICAgIGV2LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgIGlmIChxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmbiA9IHF1ZXVlLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgIGZuKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgICAgIHF1ZXVlLnB1c2goZm4pO1xuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKCdwcm9jZXNzLXRpY2snLCAnKicpO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIHJldHVybiBmdW5jdGlvbiBuZXh0VGljayhmbikge1xuICAgICAgICBzZXRUaW1lb3V0KGZuLCAwKTtcbiAgICB9O1xufSkoKTtcblxucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3MuYWRkTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5vbmNlID0gbm9vcDtcbnByb2Nlc3Mub2ZmID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59XG5cbi8vIFRPRE8oc2h0eWxtYW4pXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIxWWlaNVNcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanNcIixcIi8uLi9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wcm9jZXNzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIGlzSW5zdGFuY2VPZiA9IHJlcXVpcmUoJy4vbGFuZy9jb21tb24vaXNJbnN0YW5jZU9mLmpzJykuaXNJbnN0YW5jZU9mO1xuXG5mdW5jdGlvbiBBbnkoKSB7XG59XG5cbkFueS5wcm90b3R5cGUgPSB7XG4gIG5hbWU6ICdBbnknLFxuXG4gIF9fQW55X186IHRydWUsXG5cbiAgaXNJbnN0YW5jZU9mOiBmdW5jdGlvbiAoY2xhc3NMaWtlKSB7XG4gICAgcmV0dXJuIGlzSW5zdGFuY2VPZih0aGlzLCBjbGFzc0xpa2UpO1xuICB9LFxuXG4gIGdldENsYXNzOiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuX19uYW1lX187XG4gIH1cbn07XG5cbmV4cG9ydHMuQW55ICA9IEFueTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIxWWlaNVNcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi9BbnkuanNcIixcIi9cIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgVHJhaXQgPSByZXF1aXJlKCcuL2xhbmcvVHJhaXQuanMnKS5UcmFpdDtcblxudmFyIEVxdWFscyA9IFRyYWl0KFwiRXF1YWxzXCIpLmJvZHkoe1xuICBjYW5FcXVhbDogVHJhaXQucmVxdWlyZWQsXG4gIGVxdWFsczogVHJhaXQucmVxdWlyZWRcbn0pO1xuXG5leHBvcnRzLkVxdWFscyA9IEVxdWFscztcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIxWWlaNVNcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi9FcXVhbHMuanNcIixcIi9cIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgcyA9IHJlcXVpcmUoJy4vZ2xvYmFsLmpzJykucztcblxudmFyIGxhbmcgPSByZXF1aXJlKCcuL2xhbmcuanMnKTtcbnZhciBDbGFzcyA9IGxhbmcuQ2xhc3M7XG52YXIgQ2FzZUNsYXNzID0gbGFuZy5DYXNlQ2xhc3M7XG52YXIgQ2FzZVNpbmdsZXRvbiA9IGxhbmcuQ2FzZVNpbmdsZXRvbjtcbnZhciBUcmFpdCA9IGxhbmcuVHJhaXQ7XG5cbnZhciBjb21tb24gPSByZXF1aXJlKCcuL2xhbmcvY29tbW9uLmpzJyk7XG52YXIgcmVzdWx0ID0gY29tbW9uLnJlc3VsdDtcbnZhciBlcXVhbHMgPSBjb21tb24uZXF1YWxzO1xuXG52YXIgTm9TdWNoRWxlbWVudEV4Y2VwdGlvbiA9IHJlcXVpcmUoJy4vbGFuZy9leGNlcHRpb24uanMnKS5Ob1N1Y2hFbGVtZW50RXhjZXB0aW9uO1xuXG52YXIgT3B0aW9uID0gVHJhaXQoZnVuY3Rpb24gT3B0aW9uKHgpIHtcbiAgaWYgKHggPT09IG51bGwgfHwgeCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIE5vbmU7XG4gIH1cbiAgZWxzZSB7XG4gICAgcmV0dXJuIFNvbWUoeCk7XG4gIH1cbn0pLmJvZHkoe1xuXG4gIGlzRW1wdHk6IFRyYWl0LnJlcXVpcmVkLFxuXG4gIGlzRGVmaW5lZDogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiAhdGhpcy5pc0VtcHR5KCk7XG4gIH0sXG5cbiAgLy8gVE9ETzogUmVuYW1lIHRvIGF2b2lkIEpTIE9iamVjdCBjb25mbGljdD9cbiAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiVE9ETzogTm90SW1wbGVtZW50ZWRFcnJvclwiKTtcbiAgfSxcblxuICBnZXRPckVsc2U6IGZ1bmN0aW9uIChkZWYsIGNvbnRleHQpIHtcbiAgICBpZiAodGhpcy5pc0VtcHR5KCkpIHtcbiAgICAgIHJldHVybiByZXN1bHQoZGVmLCBjb250ZXh0KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0KCk7XG4gICAgfVxuICB9LFxuXG4gIG9yTnVsbDogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLmdldE9yRWxzZShudWxsKTtcbiAgfSxcblxuICBtYXA6IGZ1bmN0aW9uIChmLCBjb250ZXh0KSB7XG4gICAgaWYgKHRoaXMuaXNFbXB0eSgpKSB7XG4gICAgICByZXR1cm4gTm9uZTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIFNvbWUoZi5jYWxsKGNvbnRleHQsIHRoaXMuZ2V0KCkpKTtcbiAgICB9XG4gIH0sXG4gIFxuICAvLyBUT0RPOiBmb2xkIG9yIHJlZHVjZT9cbiAgZm9sZDogZnVuY3Rpb24gKGlmRW1wdHksIGNvbnRleHRJZkVtcHR5KSB7XG4gICAgLy8gVE9ETzogQmV0dGVyIHdheSB0byBkb2N1bWVudCB0aGlzIC8gYmV0dGVyIHdheSBmb3IgcGFydGlhbCBhcHBsaWNhdGlvbj9cbiAgICByZXR1cm4gZnVuY3Rpb24gKGYsIGNvbnRleHQpIHtcbiAgICAgIGlmICh0aGlzLmlzRW1wdHkoKSkge1xuICAgICAgICByZXR1cm4gcmVzdWx0KGlmRW1wdHksIGNvbnRleHRJZkVtcHR5KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmLmNhbGwoY29udGV4dCwgdGhpcy5nZXQoKSk7XG4gICAgICB9XG4gICAgfS5iaW5kKHRoaXMpO1xuICB9LFxuXG4gIC8vIFRPRE86IGZvbGQgb3IgcmVkdWNlP1xuICByZWR1Y2U6IGZ1bmN0aW9uIChmLCBpZkVtcHR5LCBjb250ZXh0KSB7XG4gICAgaWYgKHRoaXMuaXNFbXB0eSgpKSB7XG4gICAgICByZXR1cm4gcmVzdWx0KGlmRW1wdHksIGNvbnRleHQpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gZi5jYWxsKGNvbnRleHQsIHRoaXMuZ2V0KCkpO1xuICAgIH1cbiAgfSxcbiAgXG4gIGZsYXRNYXA6IGZ1bmN0aW9uIChmLCBjb250ZXh0KSB7XG4gICAgaWYgKHRoaXMuaXNFbXB0eSgpKSB7XG4gICAgICByZXR1cm4gTm9uZTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGYuY2FsbChjb250ZXh0LCB0aGlzLmdldCgpKTtcbiAgICB9XG4gIH0sXG5cbiAgZmxhdHRlbjogZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLmlzRW1wdHkoKSkge1xuICAgICAgcmV0dXJuIE5vbmU7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB0aGlzLmdldCgpO1xuICAgIH1cbiAgfSxcblxuICBmaWx0ZXI6IGZ1bmN0aW9uIChwLCBjb250ZXh0KSB7XG4gICAgaWYgKHRoaXMuaXNFbXB0eSgpIHx8IHAuY2FsbChjb250ZXh0LCB0aGlzLmdldCgpKSkge1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBOb25lO1xuICAgIH1cbiAgfSxcblxuICBmaWx0ZXJOb3Q6IGZ1bmN0aW9uIChwLCBjb250ZXh0KSB7XG4gICAgaWYgKHRoaXMuaXNFbXB0eSgpIHx8ICFwLmNhbGwoY29udGV4dCwgdGhpcy5nZXQoKSkpIHtcbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gTm9uZTtcbiAgICB9XG4gIH0sXG5cbiAgbm9uRW1wdHk6IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5pc0RlZmluZWQoKTtcbiAgfSxcblxuICAvLyBUT0RPOiBUaGlzIGlzIHRoZSBleGFjdCBzYW1lIGNvZGUgYXMgaW4gVHJ5XG4gIHdpdGhGaWx0ZXI6IGZ1bmN0aW9uIChwLCBjb250ZXh0KSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgdmFyIFdpdGhGaWx0ZXIgPSBDbGFzcyhmdW5jdGlvbiBXaXRoRmlsdGVyKHAsIGNvbnRleHQpIHtcbiAgICAgIHRoaXMucCA9IHA7XG4gICAgICB0aGlzLmNvbnRleHQgPSBjb250ZXh0O1xuICAgIH0pLmJvZHkoe1xuICAgICAgbWFwOiBmdW5jdGlvbiAoZiwgY29udGV4dCkge1xuICAgICAgICByZXR1cm4gc2VsZi5maWx0ZXIodGhpcy5wLCB0aGlzLmNvbnRleHQpLm1hcChmLCBjb250ZXh0KTtcbiAgICAgIH0sXG4gICAgICBmbGF0TWFwOiBmdW5jdGlvbiAoZiwgY29udGV4dCkge1xuICAgICAgICByZXR1cm4gc2VsZi5maWx0ZXIodGhpcy5wLCB0aGlzLmNvbnRleHQpLmZsYXRNYXAoZiwgY29udGV4dCk7XG4gICAgICB9LFxuICAgICAgZm9yRWFjaDogZnVuY3Rpb24gKGYsIGNvbnRleHQpIHtcbiAgICAgICAgcmV0dXJuIHNlbGYuZmlsdGVyKHRoaXMucCwgdGhpcy5jb250ZXh0KS5mb3JFYWNoKGYsIGNvbnRleHQpO1xuICAgICAgfSxcbiAgICAgIHdpdGhGaWx0ZXI6IGZ1bmN0aW9uIChxLCBjb250ZXh0KSB7XG4gICAgICAgIHJldHVybiBuZXcgV2l0aEZpbHRlcihmdW5jdGlvbiAoeCkge1xuICAgICAgICAgIHJldHVybiB0aGlzLnAuY2FsbCh0aGlzLmNvbnRleHQsIHgpICYmIHEuY2FsbChjb250ZXh0LCB4KTtcbiAgICAgICAgfS5iaW5kKHRoaXMpLCBjb250ZXh0KTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBuZXcgV2l0aEZpbHRlcihwLCBjb250ZXh0KTtcbiAgfSxcblxuICBjb250YWluczogZnVuY3Rpb24gKGVsZW0pIHtcbiAgICByZXR1cm4gIXRoaXMuaXNFbXB0eSgpICYmIGVxdWFscyh0aGlzLmdldCgpLCBlbGVtKTtcbiAgfSxcblxuICBleGlzdHM6IGZ1bmN0aW9uIChwLCBjb250ZXh0KSB7XG4gICAgcmV0dXJuICF0aGlzLmlzRW1wdHkoKSAmJiBwLmNhbGwoY29udGV4dCwgdGhpcy5nZXQoKSk7XG4gIH0sXG5cbiAgZm9yQWxsOiBmdW5jdGlvbiAocCwgY29udGV4dCkge1xuICAgIHJldHVybiB0aGlzLmlzRW1wdHkoKSB8fCBwLmNhbGwoY29udGV4dCwgdGhpcy5nZXQoKSk7XG4gIH0sXG5cbiAgZm9yRWFjaDogZnVuY3Rpb24gKGYsIGNvbnRleHQpIHtcbiAgICBpZiAoIXRoaXMuaXNFbXB0eSgpKSB7XG4gICAgICByZXR1cm4gZi5jYWxsKGNvbnRleHQsIHRoaXMuZ2V0KCkpO1xuICAgIH1cbiAgfSxcblxuICAvLyBUT0RPOiBjb2xsZWN0XG5cbiAgb3JFbHNlOiBmdW5jdGlvbiAoYWx0ZXJuYXRpdmUsIGNvbnRleHQpIHtcbiAgICBpZiAodGhpcy5pc0VtcHR5KCkpIHtcbiAgICAgIHJldHVybiByZXN1bHQoYWx0ZXJuYXRpdmUsIGNvbnRleHQpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gIH0sXG5cbiAgLy8gVE9ETzogaXRlcmF0b3JcblxuICAvLyBUT0RPOiB0b0xpc3RcblxuICB0b1JpZ2h0OiBmdW5jdGlvbiAobGVmdCwgY29udGV4dCkge1xuICAgIGlmIChzLkVpdGhlcikge1xuICAgICAgcmV0dXJuIHRoaXMuaXNFbXB0eSgpID8gcy5MZWZ0KHJlc3VsdChsZWZ0LCBjb250ZXh0KSkgOiBzLlJpZ2h0KHRoaXMuZ2V0KCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBFcnJvcihcIk1vZHVsZSAnRWl0aGVyJyBub3QgbG9hZGVkLlwiKTtcbiAgICB9XG4gIH0sXG5cbiAgdG9MZWZ0OiBmdW5jdGlvbiAocmlnaHQsIGNvbnRleHQpIHtcbiAgICBpZiAocy5FaXRoZXIpIHtcbiAgICAgIHJldHVybiB0aGlzLmlzRW1wdHkoKSA/IHMuUmlnaHQocmVzdWx0KHJpZ2h0LCBjb250ZXh0KSkgOiBzLkxlZnQodGhpcy5nZXQoKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IEVycm9yKFwiTW9kdWxlICdFaXRoZXInIG5vdCBsb2FkZWQuXCIpO1xuICAgIH1cbiAgfVxufSk7XG5cbk9wdGlvbi5lbXB0eSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIE5vbmU7XG59O1xuXG52YXIgU29tZSA9IENhc2VDbGFzcyhmdW5jdGlvbiBTb21lKHgpIHtcbiAgdGhpcy54ID0geDtcbn0pLmV4dGVuZHMoT3B0aW9uKS5ib2R5KHtcblxuICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy54O1xuICB9LFxuXG4gIGlzRW1wdHk6IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn0pO1xuXG52YXIgTm9uZSA9IENhc2VTaW5nbGV0b24oZnVuY3Rpb24gTm9uZSgpIHtcbn0pLmV4dGVuZHMoT3B0aW9uKS5ib2R5KHtcblxuICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICB0aHJvdyBuZXcgTm9TdWNoRWxlbWVudEV4Y2VwdGlvbihcIk5vbmUuZ2V0XCIpO1xuICB9LFxuXG4gIGlzRW1wdHk6IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufSk7XG5cbmV4cG9ydHMuT3B0aW9uID0gT3B0aW9uO1xuZXhwb3J0cy5Tb21lID0gU29tZTtcbmV4cG9ydHMuTm9uZSA9IE5vbmU7XG5cblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIxWWlaNVNcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi9PcHRpb24uanNcIixcIi9cIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgcyA9IHJlcXVpcmUoJy4vZ2xvYmFsLmpzJykucztcblxudmFyIEFueSA9IHJlcXVpcmUoJy4vQW55LmpzJykuQW55O1xudmFyIEVxdWFscyA9IHJlcXVpcmUoJy4vRXF1YWxzLmpzJykuRXF1YWxzO1xuXG52YXIgQ2xhc3MgPSByZXF1aXJlKCcuL2xhbmcvQ2xhc3MuanMnKS5DbGFzcztcbnZhciBUcmFpdCA9IHJlcXVpcmUoJy4vbGFuZy9UcmFpdC5qcycpLlRyYWl0O1xuXG52YXIgZXhjZXB0aW9uID0gcmVxdWlyZSgnLi9sYW5nL2V4Y2VwdGlvbi5qcycpO1xudmFyIEluZGV4T3V0T2ZCb3VuZHNFeGNlcHRpb24gPSBleGNlcHRpb24uSW5kZXhPdXRPZkJvdW5kc0V4Y2VwdGlvbjtcblxudmFyIGVxdWFscyA9IHJlcXVpcmUoJy4vbGFuZy9jb21tb24vZXF1YWxzLmpzJykuZXF1YWxzO1xudmFyIGlzSW5zdGFuY2VPZiA9IHJlcXVpcmUoJy4vbGFuZy9jb21tb24vaXNJbnN0YW5jZU9mLmpzJykuaXNJbnN0YW5jZU9mO1xuXG52YXIgUHJvZHVjdCA9IFRyYWl0KFwiUHJvZHVjdFwiKS53aXRoKEVxdWFscykuYm9keSh7XG4gIHByb2R1Y3RFbGVtZW50OiBmdW5jdGlvbiAobikge1xuICAgIGlmIChuIDwgdGhpcy5wcm9kdWN0QXJpdHkoKSkge1xuICAgICAgcmV0dXJuIHRoaXNbJ18nICsgKG4gKyAxKV07XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBJbmRleE91dE9mQm91bmRzRXhjZXB0aW9uKG4pO1xuICAgIH1cbiAgfSxcblxuICBwcm9kdWN0QXJpdHk6IFRyYWl0LnJlcXVpcmVkLFxuXG4gIHByb2R1Y3RJdGVyYXRvcjogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgYyA9IDA7XG4gICAgdmFyIGNtYXggPSBzZWxmLnByb2R1Y3RBcml0eSgpO1xuICAgIHJldHVybiBuZXcgKENsYXNzKEFic3RyYWN0SXRlcmF0b3IpLmJvZHkoe1xuICAgICAgaGFzTmV4dDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gYyA8IGNtYXg7XG4gICAgICB9LFxuICAgICAgbmV4dDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcmVzdWx0ID0gc2VsZi5wcm9kdWN0RWxlbWVudChjKTtcbiAgICAgICAgYysrO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgfVxuICAgIH0pKTtcbiAgfSxcblxuICAvLyBIYWNreSBpbXBsZW1lbnRhdGlvbiwgZ29vZCBlbm91Z2ggZm9yIG5vd1xuICB0b1N0cmluZzogZnVuY3Rpb24gKCkge1xuICAgIHZhciB2YWx1ZXMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucHJvZHVjdEFyaXR5KCk7IGkrKykge1xuICAgICAgdmFsdWVzLnB1c2godGhpcy5wcm9kdWN0RWxlbWVudChpKS50b1N0cmluZygpKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMucHJvZHVjdFByZWZpeCArICcoJyArIHZhbHVlcy5qb2luKCcsJykgKyAnKSc7XG4gIH0sXG5cbiAgY2FuRXF1YWw6IGZ1bmN0aW9uIChUaGF0KSB7XG4gICAgcmV0dXJuIGlzSW5zdGFuY2VPZih0aGlzLCBUaGF0KTtcbiAgfSxcblxuICBlcXVhbHM6IGZ1bmN0aW9uIChvdGhlcikge1xuICAgIGlmICh0aGlzLl9fbmFtZV9fID09PSBvdGhlci5fX25hbWVfXykge1xuICAgICAgaWYgKG90aGVyLnByb2R1Y3RBcml0eSAmJiB0aGlzLnByb2R1Y3RBcml0eSgpID09PSBvdGhlci5wcm9kdWN0QXJpdHkoKSkge1xuICAgICAgICB2YXIgcmVzID0gdHJ1ZTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnByb2R1Y3RBcml0eSgpOyBpKyspIHtcbiAgICAgICAgICByZXMgPSByZXMgJiYgZXF1YWxzKHRoaXMucHJvZHVjdEVsZW1lbnQoaSksIG90aGVyLnByb2R1Y3RFbGVtZW50KGkpKVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXNcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9LFxuXG4gIC8vID8/P1xuICBwcm9kdWN0UHJlZml4OiAnJ1xuXG59KTtcblxudmFyIFByb2R1Y3QxID0gVHJhaXQoXCJQcm9kdWN0MVwiKS5leHRlbmRzKFByb2R1Y3QpLmJvZHkoe1xuICBwcm9kdWN0QXJpdHk6IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gMTtcbiAgfSxcblxuICBfMTogVHJhaXQucmVxdWlyZWRcbn0pO1xuXG52YXIgUHJvZHVjdDIgPSBUcmFpdChcIlByb2R1Y3QyXCIpLmV4dGVuZHMoUHJvZHVjdCkuYm9keSh7XG4gIHByb2R1Y3RBcml0eTogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiAyO1xuICB9LFxuXG4gIF8xOiBUcmFpdC5yZXF1aXJlZCxcbiAgXzI6IFRyYWl0LnJlcXVpcmVkXG59KTtcblxudmFyIFByb2R1Y3QzID0gVHJhaXQoXCJQcm9kdWN0M1wiKS5leHRlbmRzKFByb2R1Y3QpLmJvZHkoe1xuICBwcm9kdWN0QXJpdHk6IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gMztcbiAgfSxcblxuICBfMTogVHJhaXQucmVxdWlyZWQsXG4gIF8yOiBUcmFpdC5yZXF1aXJlZCxcbiAgXzM6IFRyYWl0LnJlcXVpcmVkXG59KTtcblxuZnVuY3Rpb24gY3JlYXRlUHJvZHVjdChuKSB7XG4gIHZhciBib2R5ID0ge1xuICAgIHByb2R1Y3RBcml0eTogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIG47XG4gICAgfVxuICB9O1xuXG4gIGZvciAodmFyIGkgPSAxOyBpIDw9IG47IGkrKykge1xuICAgIGJvZHlbJ18nICsgaV0gPSBUcmFpdC5yZXF1aXJlZDtcbiAgfVxuXG4gIHJldHVybiBUcmFpdChcIlByb2R1Y3RcIiArIG4pLmV4dGVuZHMoUHJvZHVjdCkuYm9keShib2R5KTtcbn1cblxuZnVuY3Rpb24gZ2V0UHJvZHVjdChuKSB7XG4gIGlmICghc1snUHJvZHVjdCcgKyBuXSkge1xuICAgIHNbJ1Byb2R1Y3QnICsgbl0gPSBjcmVhdGVQcm9kdWN0KG4pO1xuICB9XG4gIHJldHVybiBzWydQcm9kdWN0JyArIG5dO1xufVxuXG5leHBvcnRzLlByb2R1Y3QgPSBQcm9kdWN0O1xuZXhwb3J0cy5Qcm9kdWN0MSA9IFByb2R1Y3QxO1xuZXhwb3J0cy5Qcm9kdWN0MiA9IFByb2R1Y3QyO1xuZXhwb3J0cy5Qcm9kdWN0MyA9IFByb2R1Y3QzO1xuZXhwb3J0cy5nZXRQcm9kdWN0ID0gZ2V0UHJvZHVjdDtcblxuZm9yICh2YXIgaSA9IDQ7IGkgPD0gMjI7IGkrKykge1xuICBleHBvcnRzWydQcm9kdWN0JyArIGldID0gZ2V0UHJvZHVjdChpKTtcbn1cblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIxWWlaNVNcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi9Qcm9kdWN0LmpzXCIsXCIvXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIHMgPSByZXF1aXJlKCcuL2dsb2JhbC5qcycpLnM7XG5cbnZhciBBbnkgPSByZXF1aXJlKCcuL0FueS5qcycpLkFueTtcblxudmFyIENsYXNzID0gcmVxdWlyZSgnLi9sYW5nL0NsYXNzLmpzJykuQ2xhc3M7XG52YXIgQ2FzZUNsYXNzID0gcmVxdWlyZSgnLi9sYW5nL0Nhc2VDbGFzcy5qcycpLkNhc2VDbGFzcztcblxudmFyIHByb2R1Y3QgPSByZXF1aXJlKCcuL1Byb2R1Y3QuanMnKTtcbnZhciBQcm9kdWN0ID0gcHJvZHVjdC5Qcm9kdWN0O1xudmFyIFByb2R1Y3QxID0gcHJvZHVjdC5Qcm9kdWN0MTtcbnZhciBQcm9kdWN0MiA9IHByb2R1Y3QuUHJvZHVjdDI7XG52YXIgUHJvZHVjdDMgPSBwcm9kdWN0LlByb2R1Y3QzO1xudmFyIGdldFByb2R1Y3QgPSBwcm9kdWN0LmdldFByb2R1Y3Q7XG5cbnZhciBUdXBsZTEgPSBDYXNlQ2xhc3MoZnVuY3Rpb24gVHVwbGUxKF8xKSB7XG59KS5leHRlbmRzKFByb2R1Y3QxKS5ib2R5KCk7XG5cbnZhciBUdXBsZTIgPSBDYXNlQ2xhc3MoZnVuY3Rpb24gVHVwbGUyKF8xLCBfMikge1xufSkuZXh0ZW5kcyhQcm9kdWN0MikuYm9keSgpO1xuXG52YXIgVHVwbGUzID0gQ2FzZUNsYXNzKGZ1bmN0aW9uIFR1cGxlMyhfMSwgXzIsIF8zKSB7XG59KS5leHRlbmRzKFByb2R1Y3QzKS5ib2R5KCk7XG5cbmZ1bmN0aW9uIGNyZWF0ZVR1cGxlKG4pIHtcbiAgdmFyIGRlZmF1bHRzID0ge307XG4gIGZvciAodmFyIGkgPSAxOyBpIDw9IG47IGkrKykge1xuICAgIGRlZmF1bHRzWydfJyArIGldID0gdW5kZWZpbmVkO1xuICB9XG4gIHJldHVybiBDYXNlQ2xhc3MoXCJUdXBsZVwiICsgbiwgZGVmYXVsdHMpLmV4dGVuZHMoZ2V0UHJvZHVjdChuKSkuYm9keSgpO1xufVxuXG5mdW5jdGlvbiBnZXRUdXBsZShuKSB7XG4gIGlmICghc1snVHVwbGUnICsgbl0pIHtcbiAgICBzWydUdXBsZScgKyBuXSA9IGNyZWF0ZVR1cGxlKG4pO1xuICB9XG4gIHJldHVybiBzWydUdXBsZScgKyBuXTtcbn1cblxuZnVuY3Rpb24gdCgpIHtcbiAgcmV0dXJuIGdldFR1cGxlKGFyZ3VtZW50cy5sZW5ndGgpLmFwcGx5KHVuZGVmaW5lZCwgYXJndW1lbnRzKTtcbn1cblxuZXhwb3J0cy5UdXBsZTEgPSBUdXBsZTE7XG5leHBvcnRzLlR1cGxlMiA9IFR1cGxlMjtcbmV4cG9ydHMuVHVwbGUzID0gVHVwbGUzO1xuZXhwb3J0cy5nZXRUdXBsZSA9IGdldFR1cGxlO1xuZXhwb3J0cy50ID0gdDtcblxuZm9yICh2YXIgaSA9IDQ7IGkgPD0gMjI7IGkrKykge1xuICBleHBvcnRzWydUdXBsZScgKyBpXSA9IGdldFR1cGxlKGkpO1xufVxuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL1R1cGxlLmpzXCIsXCIvXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIHMgPSByZXF1aXJlKCcuL2dsb2JhbC5qcycpLnM7XG5cbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL2xhbmcvY29tbW9uL2V4dGVuZC5qcycpLmV4dGVuZDtcblxudmFyIGxhbmcgPSByZXF1aXJlKCcuL2xhbmcuanMnKTtcblxudmFyIGV4Y2VwdGlvbiA9IHJlcXVpcmUoJy4vbGFuZy9leGNlcHRpb24uanMnKTtcblxudmFyIHByb2R1Y3QgPSByZXF1aXJlKCcuL1Byb2R1Y3QuanMnKTtcbnZhciB0dXBsZSA9IHJlcXVpcmUoJy4vVHVwbGUuanMnKTtcblxudmFyIG9wdGlvbiA9IHJlcXVpcmUoJy4vT3B0aW9uLmpzJyk7XG5cbnZhciBhbnkgPSByZXF1aXJlKCcuL0FueS5qcycpO1xudmFyIGVxdWFscyA9IHJlcXVpcmUoJy4vRXF1YWxzLmpzJyk7XG5cbnMgPSBleHRlbmQocywgbGFuZyk7XG5zID0gZXh0ZW5kKHMsIGV4Y2VwdGlvbik7XG5zID0gZXh0ZW5kKHMsIHByb2R1Y3QpO1xucyA9IGV4dGVuZChzLCB0dXBsZSk7XG5zID0gZXh0ZW5kKHMsIG9wdGlvbik7XG5zID0gZXh0ZW5kKHMsIHtcbiAgXzogdW5kZWZpbmVkLFxuICBBbnk6IGFueS5BbnksXG4gIEVxdWFsczogZXF1YWxzLkVxdWFsc1xufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gcztcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIxWWlaNVNcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi9mYWtlX2RhYTIyNGE5LmpzXCIsXCIvXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIHMgPSB7fTtcbmV4cG9ydHMucyA9IHM7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvZ2xvYmFsLmpzXCIsXCIvXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIENsYXNzID0gcmVxdWlyZSgnLi9sYW5nL0NsYXNzLmpzJykuQ2xhc3M7XG52YXIgU2luZ2xldG9uID0gcmVxdWlyZSgnLi9sYW5nL1NpbmdsZXRvbi5qcycpLlNpbmdsZXRvbjtcbnZhciBDYXNlQ2xhc3MgPSByZXF1aXJlKCcuL2xhbmcvQ2FzZUNsYXNzLmpzJykuQ2FzZUNsYXNzO1xudmFyIENhc2VTaW5nbGV0b24gPSByZXF1aXJlKCcuL2xhbmcvQ2FzZVNpbmdsZXRvbi5qcycpLkNhc2VTaW5nbGV0b247XG52YXIgVHJhaXQgPSByZXF1aXJlKCcuL2xhbmcvVHJhaXQuanMnKS5UcmFpdDtcblxudmFyIGxhbmcgPSB7XG4gIENsYXNzOiBDbGFzcyxcbiAgU2luZ2xldG9uOiBTaW5nbGV0b24sXG4gIENhc2VDbGFzczogQ2FzZUNsYXNzLFxuICBDYXNlU2luZ2xldG9uOiBDYXNlU2luZ2xldG9uLFxuICBUcmFpdDogVHJhaXRcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gbGFuZztcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIxWWlaNVNcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi9sYW5nLmpzXCIsXCIvXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIEFueSA9IHJlcXVpcmUoJy4uL0FueS5qcycpLkFueTtcblxudmFyIG1ha2VDbGFzc0J1aWxkZXIgPSByZXF1aXJlKCcuL0NsYXNzLmpzJykubWFrZUNsYXNzQnVpbGRlcjtcbnZhciBtYWtlV2l0aFRyYWl0Q2xhc3NCdWlsZGVyID0gcmVxdWlyZSgnLi9DbGFzcy5qcycpLm1ha2VXaXRoVHJhaXRDbGFzc0J1aWxkZXI7XG5cbnZhciBjYXNlQ2xhc3NpZnkgPSByZXF1aXJlKCcuL2NvbW1vbi9jYXNlQ2xhc3NpZnkuanMnKS5jYXNlQ2xhc3NpZnk7XG5cbnZhciBpc0Z1bmN0aW9uID0gcmVxdWlyZSgnLi9jb21tb24vdHlwZUNoZWNrLmpzJykuaXNGdW5jdGlvbjtcbnZhciBpc1N0cmluZyA9IHJlcXVpcmUoJy4vY29tbW9uL3R5cGVDaGVjay5qcycpLmlzU3RyaW5nO1xudmFyIGlzQXJyYXkgPSByZXF1aXJlKCcuL2NvbW1vbi90eXBlQ2hlY2suanMnKS5pc0FycmF5O1xudmFyIGlzT2JqZWN0ID0gcmVxdWlyZSgnLi9jb21tb24vdHlwZUNoZWNrLmpzJykuaXNPYmplY3Q7XG5cbmZ1bmN0aW9uIGdldE5hbWUoZm4pIHtcbiAgLy8gVE9ETzogQ3Jvc3MtYnJvd3Nlcj9cbiAgcmV0dXJuIGZuLm5hbWU7XG59XG5cbmZ1bmN0aW9uIG1ha2VDYXNlQ2xhc3NCdWlsZGVyKENsYXNzQnVpbGRlcikge1xuXG4gIGZ1bmN0aW9uIENhc2VDbGFzc0J1aWxkZXIobmFtZSwgQ3Rvcikge1xuICAgIGlmIChpc0Z1bmN0aW9uKG5hbWUpKSB7XG4gICAgICB0aGlzLkN0b3IgPSBuYW1lO1xuICAgICAgdGhpcy5uYW1lID0gZ2V0TmFtZSh0aGlzLkN0b3IpO1xuICAgIH1cbiAgICBlbHNlIGlmIChpc1N0cmluZyhuYW1lKSkge1xuICAgICAgdGhpcy5DdG9yID0gZnVuY3Rpb24gQ2FzZUNsYXNzKCkge1xuICAgICAgICBpZiAodGhpcy5jb25zdHJ1Y3Rvcikge1xuICAgICAgICAgIHRoaXMuY29uc3RydWN0b3IuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgdGhyb3cgRXJyb3IoXCJ3cm9uZ1wiKVxuICAgIH1cblxuICAgIGlmIChpc09iamVjdChDdG9yKSkge1xuICAgICAgdGhpcy5kZWZhdWx0cyA9IEN0b3I7XG4gICAgfVxuXG4gICAgdGhpcy5DdG9yLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoQW55LnByb3RvdHlwZSk7XG4gICAgdGhpcy5DdG9yLnByb3RvdHlwZVsnX18nICsgdGhpcy5uYW1lICsgJ19fJ10gPSB0cnVlO1xuICB9XG5cbiAgQ2FzZUNsYXNzQnVpbGRlci5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKENsYXNzQnVpbGRlci5wcm90b3R5cGUpO1xuXG4gIENhc2VDbGFzc0J1aWxkZXIucHJvdG90eXBlLmJvZHkgPSBmdW5jdGlvbiAoYm9keSkge1xuICAgIHZhciBDdG9yID0gQ2xhc3NCdWlsZGVyLnByb3RvdHlwZS5ib2R5LmNhbGwodGhpcywgYm9keSk7IC8vIHN1cGVyLmJvZHkoYm9keSk7XG4gICAgcmV0dXJuIGNhc2VDbGFzc2lmeShDdG9yLCB0aGlzLm5hbWUsIHRoaXMuZGVmYXVsdHMpO1xuICB9O1xuXG4gIHJldHVybiBDYXNlQ2xhc3NCdWlsZGVyO1xufVxuXG5mdW5jdGlvbiBtYWtlV2l0aFRyYWl0Q2FzZUNsYXNzQnVpbGRlcihXaXRoVHJhaXRDbGFzc0J1aWxkZXIpIHtcblxuICBmdW5jdGlvbiBXaXRoVHJhaXRDYXNlQ2xhc3NCdWlsZGVyKGluc3RhbmNlKSB7XG4gICAgdGhpcy5uYW1lID0gaW5zdGFuY2UubmFtZTtcbiAgICB0aGlzLkN0b3IgPSBpbnN0YW5jZS5DdG9yO1xuICAgIHRoaXMuZGVmYXVsdHMgPSBpbnN0YW5jZS5kZWZhdWx0cztcbiAgfVxuXG4gIFdpdGhUcmFpdENhc2VDbGFzc0J1aWxkZXIucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShXaXRoVHJhaXRDbGFzc0J1aWxkZXIucHJvdG90eXBlKTtcblxuICBXaXRoVHJhaXRDYXNlQ2xhc3NCdWlsZGVyLnByb3RvdHlwZS5ib2R5ID0gZnVuY3Rpb24gKGJvZHkpIHtcbiAgICB2YXIgQ3RvciA9IFdpdGhUcmFpdENsYXNzQnVpbGRlci5wcm90b3R5cGUuYm9keS5jYWxsKHRoaXMsIGJvZHkpOyAvLyBzdXBlci5ib2R5KGJvZHkpO1xuICAgIHJldHVybiBjYXNlQ2xhc3NpZnkoQ3RvciwgdGhpcy5uYW1lLCB0aGlzLmRlZmF1bHRzKTtcbiAgfTtcblxuICByZXR1cm4gV2l0aFRyYWl0Q2FzZUNsYXNzQnVpbGRlcjtcbn1cblxudmFyIFdpdGhUcmFpdENhc2VDbGFzc0J1aWxkZXIgPSBtYWtlV2l0aFRyYWl0Q2FzZUNsYXNzQnVpbGRlcihtYWtlV2l0aFRyYWl0Q2xhc3NCdWlsZGVyKCkpO1xudmFyIENhc2VDbGFzc0J1aWxkZXIgPSBtYWtlQ2FzZUNsYXNzQnVpbGRlcihtYWtlQ2xhc3NCdWlsZGVyKFdpdGhUcmFpdENhc2VDbGFzc0J1aWxkZXIpKTtcblxuZnVuY3Rpb24gQ2FzZUNsYXNzKG5hbWUsIEN0b3IpIHtcbiAgcmV0dXJuIG5ldyBDYXNlQ2xhc3NCdWlsZGVyKG5hbWUsIEN0b3IpO1xufVxuXG5leHBvcnRzLm1ha2VXaXRoVHJhaXRDYXNlQ2xhc3NCdWlsZGVyID0gbWFrZVdpdGhUcmFpdENhc2VDbGFzc0J1aWxkZXI7XG5leHBvcnRzLm1ha2VDYXNlQ2xhc3NCdWlsZGVyID0gbWFrZUNhc2VDbGFzc0J1aWxkZXI7XG5cbi8vZXhwb3J0cy5DYXNlQ2xhc3NCdWlsZGVyID0gQ2FzZUNsYXNzQnVpbGRlcjtcbi8vZXhwb3J0cy5XaXRoVHJhaXRDYXNlQ2xhc3NCdWlsZGVyID0gV2l0aFRyYWl0Q2FzZUNsYXNzQnVpbGRlcjtcblxuZXhwb3J0cy5DYXNlQ2xhc3MgPSBDYXNlQ2xhc3M7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvbGFuZy9DYXNlQ2xhc3MuanNcIixcIi9sYW5nXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIG1ha2VDbGFzc0J1aWxkZXIgPSByZXF1aXJlKCcuL0NsYXNzLmpzJykubWFrZUNsYXNzQnVpbGRlcjtcbnZhciBtYWtlV2l0aFRyYWl0Q2xhc3NCdWlsZGVyID0gcmVxdWlyZSgnLi9DbGFzcy5qcycpLm1ha2VXaXRoVHJhaXRDbGFzc0J1aWxkZXI7XG5cbnZhciBtYWtlQ2FzZUNsYXNzQnVpbGRlciA9IHJlcXVpcmUoJy4vQ2FzZUNsYXNzLmpzJykubWFrZUNhc2VDbGFzc0J1aWxkZXI7XG52YXIgbWFrZVdpdGhUcmFpdENhc2VDbGFzc0J1aWxkZXIgPSByZXF1aXJlKCcuL0Nhc2VDbGFzcy5qcycpLm1ha2VXaXRoVHJhaXRDYXNlQ2xhc3NCdWlsZGVyO1xuXG52YXIgbWFrZVNpbmdsZXRvbkJ1aWxkZXIgPSByZXF1aXJlKCcuL1NpbmdsZXRvbi5qcycpLm1ha2VTaW5nbGV0b25CdWlsZGVyO1xudmFyIG1ha2VXaXRoVHJhaXRTaW5nbGV0b25CdWlsZGVyID0gcmVxdWlyZSgnLi9TaW5nbGV0b24uanMnKS5tYWtlV2l0aFRyYWl0U2luZ2xldG9uQnVpbGRlcjtcblxuLy8gV2hlcmUgaXMgeW91ciBnb2Qgbm93P1xudmFyIFdpdGhUcmFpdENhc2VTaW5nbGV0b25CdWlsZGVyID0gbWFrZVdpdGhUcmFpdFNpbmdsZXRvbkJ1aWxkZXIobWFrZVdpdGhUcmFpdENhc2VDbGFzc0J1aWxkZXIobWFrZVdpdGhUcmFpdENsYXNzQnVpbGRlcigpKSk7XG52YXIgQ2FzZVNpbmdsZXRvbkJ1aWxkZXIgPSBtYWtlU2luZ2xldG9uQnVpbGRlcihtYWtlQ2FzZUNsYXNzQnVpbGRlcihtYWtlQ2xhc3NCdWlsZGVyKFdpdGhUcmFpdENhc2VTaW5nbGV0b25CdWlsZGVyKSkpO1xuXG5mdW5jdGlvbiBDYXNlU2luZ2xldG9uKEN0b3IpIHtcbiAgcmV0dXJuIG5ldyBDYXNlU2luZ2xldG9uQnVpbGRlcihDdG9yKTtcbn1cblxuZXhwb3J0cy5DYXNlU2luZ2xldG9uID0gQ2FzZVNpbmdsZXRvbjtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIxWWlaNVNcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi9sYW5nL0Nhc2VTaW5nbGV0b24uanNcIixcIi9sYW5nXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIEFueSA9IHJlcXVpcmUoJy4uL0FueS5qcycpLkFueTtcblxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vY29tbW9uL2V4dGVuZC5qcycpLmV4dGVuZDtcbnZhciBpc1N0cmluZyA9IHJlcXVpcmUoJy4vY29tbW9uL3R5cGVDaGVjay5qcycpLmlzU3RyaW5nO1xudmFyIGlzRnVuY3Rpb24gPSByZXF1aXJlKCcuL2NvbW1vbi90eXBlQ2hlY2suanMnKS5pc0Z1bmN0aW9uO1xuXG5mdW5jdGlvbiBtYWtlQ2xhc3NCdWlsZGVyKFdpdGhUcmFpdENsYXNzQnVpbGRlcikge1xuICBmdW5jdGlvbiBDbGFzc0J1aWxkZXIoQ3RvciwgbmFtZSkge1xuICAgIGlmIChpc0Z1bmN0aW9uKEN0b3IpKSB7XG4gICAgICB0aGlzLkN0b3IgPSBDdG9yO1xuICAgICAgbmFtZSA9IG5hbWUgfHwgQ3Rvci5uYW1lO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLkN0b3IgPSBmdW5jdGlvbiBDbGFzcygpIHtcbiAgICAgICAgaWYgKHRoaXMuY29uc3RydWN0b3IpIHtcbiAgICAgICAgICB0aGlzLmNvbnN0cnVjdG9yLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBuYW1lID0gQ3RvclxuICAgIH1cblxuICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgdGhpcy5DdG9yLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoQW55LnByb3RvdHlwZSk7XG4gICAgdGhpcy5DdG9yLnByb3RvdHlwZVsnX18nICsgdGhpcy5uYW1lICsgJ19fJ10gPSB0cnVlO1xuICB9XG5cbiAgQ2xhc3NCdWlsZGVyLnByb3RvdHlwZSA9IHtcbiAgICBib2R5OiBmdW5jdGlvbiAoYm9keSkge1xuICAgICAgYm9keSA9IGJvZHkgfHwge307XG4gICAgICBleHRlbmQodGhpcy5DdG9yLnByb3RvdHlwZSwgYm9keSk7XG4gICAgICB0aGlzLkN0b3IucHJvdG90eXBlLm5hbWUgPSB0aGlzLm5hbWU7XG4gICAgICB0aGlzLkN0b3IucHJvdG90eXBlLl9fbmFtZV9fID0gdGhpcy5uYW1lO1xuICAgICAgcmV0dXJuIHRoaXMuQ3RvcjtcbiAgICB9LFxuXG4gICAgZXh0ZW5kejogZnVuY3Rpb24gKFBhcmVudCkge1xuICAgICAgdGhpcy5DdG9yLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoUGFyZW50LnByb3RvdHlwZSk7XG5cbiAgICAgIGlmICghUGFyZW50Ll9fQW55X18pIHtcbiAgICAgICAgZXh0ZW5kKHRoaXMuQ3Rvci5wcm90b3R5cGUsIEFueS5wcm90b3R5cGUpO1xuICAgICAgfVxuXG4gICAgICB0aGlzLkN0b3IucHJvdG90eXBlWydfXycgKyB0aGlzLm5hbWUgKyAnX18nXSA9IHRydWU7XG5cbiAgICAgIHJldHVybiBuZXcgV2l0aFRyYWl0Q2xhc3NCdWlsZGVyKHRoaXMpO1xuICAgIH0sXG5cbiAgICAnZXh0ZW5kcyc6IGZ1bmN0aW9uIChQYXJlbnQpIHtcbiAgICAgIHJldHVybiB0aGlzLmV4dGVuZHooUGFyZW50KTtcbiAgICB9LFxuXG4gICAgd2l0aHo6IGZ1bmN0aW9uICh0cnQpIHtcbiAgICAgIGV4dGVuZCh0aGlzLkN0b3IucHJvdG90eXBlLCB0cnQucHJvdG90eXBlKTtcbiAgICAgIHJldHVybiBuZXcgV2l0aFRyYWl0Q2xhc3NCdWlsZGVyKHRoaXMpO1xuICAgIH0sXG5cbiAgICAnd2l0aCc6IGZ1bmN0aW9uICh0cnQpIHtcbiAgICAgIGlmIChpc0Z1bmN0aW9uKHRydCkpIHsgLy8gVHJhaXRzIGFyZSBmdW5jdGlvbnNcbiAgICAgICAgcmV0dXJuIHRoaXMud2l0aHoodHJ0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB0aGlzLmJvZHkodHJ0KTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgcmV0dXJuIENsYXNzQnVpbGRlcjtcbn1cblxuZnVuY3Rpb24gbWFrZVdpdGhUcmFpdENsYXNzQnVpbGRlcigpIHtcbiAgZnVuY3Rpb24gV2l0aFRyYWl0Q2xhc3NCdWlsZGVyKGluc3RhbmNlKSB7XG4gICAgdGhpcy5uYW1lID0gaW5zdGFuY2UubmFtZTtcbiAgICB0aGlzLkN0b3IgPSBpbnN0YW5jZS5DdG9yO1xuICB9XG5cbiAgV2l0aFRyYWl0Q2xhc3NCdWlsZGVyLnByb3RvdHlwZSA9IHtcbiAgICBib2R5OiBmdW5jdGlvbiAoYm9keSkge1xuICAgICAgYm9keSA9IGJvZHkgfHwge307XG4gICAgICBleHRlbmQodGhpcy5DdG9yLnByb3RvdHlwZSwgYm9keSk7XG4gICAgICB0aGlzLkN0b3IucHJvdG90eXBlLm5hbWUgPSB0aGlzLm5hbWU7XG4gICAgICB0aGlzLkN0b3IucHJvdG90eXBlLl9fbmFtZV9fID0gdGhpcy5uYW1lO1xuICAgICAgcmV0dXJuIHRoaXMuQ3RvcjtcbiAgICB9LFxuXG4gICAgd2l0aHo6IGZ1bmN0aW9uICh0cnQpIHtcbiAgICAgIGV4dGVuZCh0aGlzLkN0b3IucHJvdG90eXBlLCB0cnQucHJvdG90eXBlKTtcbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICAnd2l0aCc6IGZ1bmN0aW9uICh0cnQpIHtcbiAgICAgIGlmIChpc0Z1bmN0aW9uKHRydCkpIHsgLy8gVHJhaXRzIGFyZSBmdW5jdGlvbnNcbiAgICAgICAgcmV0dXJuIHRoaXMud2l0aHoodHJ0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB0aGlzLmJvZHkodHJ0KTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgcmV0dXJuIFdpdGhUcmFpdENsYXNzQnVpbGRlcjtcbn1cblxudmFyIFdpdGhUcmFpdENsYXNzQnVpbGRlciA9IG1ha2VXaXRoVHJhaXRDbGFzc0J1aWxkZXIoKTtcbnZhciBDbGFzc0J1aWxkZXIgPSBtYWtlQ2xhc3NCdWlsZGVyKFdpdGhUcmFpdENsYXNzQnVpbGRlcik7XG5cbmZ1bmN0aW9uIENsYXNzKEN0b3IsIG5hbWUpIHtcbiAgcmV0dXJuIG5ldyBDbGFzc0J1aWxkZXIoQ3RvciwgbmFtZSk7XG59XG5cbmV4cG9ydHMubWFrZUNsYXNzQnVpbGRlciA9IG1ha2VDbGFzc0J1aWxkZXI7XG5leHBvcnRzLm1ha2VXaXRoVHJhaXRDbGFzc0J1aWxkZXIgPSBtYWtlV2l0aFRyYWl0Q2xhc3NCdWlsZGVyO1xuXG4vL2V4cG9ydHMuQ2xhc3NCdWlsZGVyID0gQ2xhc3NCdWlsZGVyO1xuLy9leHBvcnRzLldpdGhUcmFpdENsYXNzQnVpbGRlciA9IFdpdGhUcmFpdENsYXNzQnVpbGRlcjtcblxuZXhwb3J0cy5DbGFzcyA9IENsYXNzO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL2xhbmcvQ2xhc3MuanNcIixcIi9sYW5nXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIG1ha2VDbGFzc0J1aWxkZXIgPSByZXF1aXJlKCcuL0NsYXNzLmpzJykubWFrZUNsYXNzQnVpbGRlcjtcbnZhciBtYWtlV2l0aFRyYWl0Q2xhc3NCdWlsZGVyID0gcmVxdWlyZSgnLi9DbGFzcy5qcycpLm1ha2VXaXRoVHJhaXRDbGFzc0J1aWxkZXI7XG5cbmZ1bmN0aW9uIG1ha2VTaW5nbGV0b25CdWlsZGVyKENsYXNzQnVpbGRlcikge1xuXG4gIGZ1bmN0aW9uIFNpbmdsZXRvbkJ1aWxkZXIoQ3Rvcikge1xuICAgIENsYXNzQnVpbGRlci5jYWxsKHRoaXMsIEN0b3IpO1xuICB9XG5cbiAgU2luZ2xldG9uQnVpbGRlci5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKENsYXNzQnVpbGRlci5wcm90b3R5cGUpO1xuXG4gIFNpbmdsZXRvbkJ1aWxkZXIucHJvdG90eXBlLmJvZHkgPSBmdW5jdGlvbiAoYm9keSkge1xuICAgIHZhciBDdG9yID0gQ2xhc3NCdWlsZGVyLnByb3RvdHlwZS5ib2R5LmNhbGwodGhpcywgYm9keSk7IC8vIHN1cGVyLmJvZHkoYm9keSk7XG4gICAgaWYgKCFDdG9yLmluc3RhbmNlKSB7XG4gICAgICBDdG9yLmluc3RhbmNlID0gbmV3IEN0b3IoKTtcbiAgICB9XG4gICAgcmV0dXJuIEN0b3IuaW5zdGFuY2U7XG4gIH07XG5cbiAgcmV0dXJuIFNpbmdsZXRvbkJ1aWxkZXI7XG59XG5cbmZ1bmN0aW9uIG1ha2VXaXRoVHJhaXRTaW5nbGV0b25CdWlsZGVyKFdpdGhUcmFpdENsYXNzQnVpbGRlcikge1xuXG4gIGZ1bmN0aW9uIFdpdGhUcmFpdENhc2VDbGFzc0J1aWxkZXIoaW5zdGFuY2UpIHtcbiAgICBXaXRoVHJhaXRDbGFzc0J1aWxkZXIuY2FsbCh0aGlzLCBpbnN0YW5jZSk7XG4gIH1cblxuICBXaXRoVHJhaXRDYXNlQ2xhc3NCdWlsZGVyLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoV2l0aFRyYWl0Q2xhc3NCdWlsZGVyLnByb3RvdHlwZSk7XG5cbiAgV2l0aFRyYWl0Q2FzZUNsYXNzQnVpbGRlci5wcm90b3R5cGUuYm9keSA9IGZ1bmN0aW9uIChib2R5KSB7XG4gICAgdmFyIEN0b3IgPSBXaXRoVHJhaXRDbGFzc0J1aWxkZXIucHJvdG90eXBlLmJvZHkuY2FsbCh0aGlzLCBib2R5KTsgLy8gc3VwZXIuYm9keShib2R5KTtcbiAgICBpZiAoIUN0b3IuaW5zdGFuY2UpIHtcbiAgICAgIEN0b3IuaW5zdGFuY2UgPSBuZXcgQ3RvcigpO1xuICAgIH1cbiAgICByZXR1cm4gQ3Rvci5pbnN0YW5jZTtcbiAgfTtcblxuICByZXR1cm4gV2l0aFRyYWl0Q2FzZUNsYXNzQnVpbGRlcjtcbn1cblxudmFyIFdpdGhUcmFpdFNpbmdsZXRvbkJ1aWxkZXIgPSBtYWtlV2l0aFRyYWl0U2luZ2xldG9uQnVpbGRlcihtYWtlV2l0aFRyYWl0Q2xhc3NCdWlsZGVyKCkpO1xudmFyIFNpbmdsZXRvbkJ1aWxkZXIgPSBtYWtlU2luZ2xldG9uQnVpbGRlcihtYWtlQ2xhc3NCdWlsZGVyKFdpdGhUcmFpdFNpbmdsZXRvbkJ1aWxkZXIpKTtcblxuZnVuY3Rpb24gU2luZ2xldG9uKEN0b3IpIHtcbiAgcmV0dXJuIG5ldyBTaW5nbGV0b25CdWlsZGVyKEN0b3IpO1xufVxuXG5leHBvcnRzLm1ha2VTaW5nbGV0b25CdWlsZGVyID0gbWFrZVNpbmdsZXRvbkJ1aWxkZXI7XG5leHBvcnRzLm1ha2VXaXRoVHJhaXRTaW5nbGV0b25CdWlsZGVyID0gbWFrZVdpdGhUcmFpdFNpbmdsZXRvbkJ1aWxkZXI7XG5cbi8vZXhwb3J0cy5TaW5nbGV0b25CdWlsZGVyID0gU2luZ2xldG9uQnVpbGRlcjtcbi8vZXhwb3J0cy5XaXRoVHJhaXRTaW5nbGV0b25CdWlsZGVyID0gV2l0aFRyYWl0U2luZ2xldG9uQnVpbGRlcjtcblxuZXhwb3J0cy5TaW5nbGV0b24gPSBTaW5nbGV0b247XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvbGFuZy9TaW5nbGV0b24uanNcIixcIi9sYW5nXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIEFueSA9IHJlcXVpcmUoJy4uL0FueS5qcycpLkFueTtcblxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vY29tbW9uL2V4dGVuZC5qcycpLmV4dGVuZDtcbnZhciBpc0Z1bmN0aW9uID0gcmVxdWlyZSgnLi9jb21tb24vdHlwZUNoZWNrLmpzJykuaXNGdW5jdGlvbjtcblxuZnVuY3Rpb24gVHJhaXRCdWlsZGVyKG5hbWUpIHtcbiAgaWYgKGlzRnVuY3Rpb24obmFtZSkpIHtcbiAgICB0aGlzLkN0b3IgPSBuYW1lO1xuICAgIG5hbWUgPSBuYW1lLm5hbWU7XG4gIH1cbiAgZWxzZSB7XG4gICAgdGhpcy5DdG9yID0gZnVuY3Rpb24gVHJhaXQoKSB7XG4gICAgfTtcbiAgICB0aGlzLkN0b3IucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShBbnkucHJvdG90eXBlKTtcbiAgfVxuXG4gIHRoaXMuQ3Rvci5wcm90b3R5cGUubmFtZSA9IG5hbWU7XG4gIHRoaXMuQ3Rvci5wcm90b3R5cGVbJ19fJyArIG5hbWUgKyAnX18nXSA9IHRydWU7XG59XG5cblRyYWl0QnVpbGRlci5wcm90b3R5cGUgPSB7XG4gIHdpdGh6OiBmdW5jdGlvbiAoVHJhaXQpIHtcbiAgICBleHRlbmQodGhpcy5DdG9yLnByb3RvdHlwZSwgVHJhaXQucHJvdG90eXBlKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfSxcbiAgXG4gICd3aXRoJzogZnVuY3Rpb24gKFRyYWl0KSB7XG4gICAgcmV0dXJuIHRoaXMud2l0aHooVHJhaXQpO1xuICB9LFxuICBcbiAgZXh0ZW5kejogZnVuY3Rpb24gKFRyYWl0KSB7XG4gICAgdGhpcy5DdG9yLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoVHJhaXQucHJvdG90eXBlKTtcblxuICAgIGlmICghVHJhaXQuX19BbnlfXykge1xuICAgICAgZXh0ZW5kKHRoaXMuQ3Rvci5wcm90b3R5cGUsIEFueS5wcm90b3R5cGUpO1xuICAgIH1cblxuICAgIHRoaXMuQ3Rvci5wcm90b3R5cGVbJ19fJyArIHRoaXMubmFtZSArICdfXyddID0gdHJ1ZTtcbiAgICBcbiAgICAvLyBUT0RPOiBXaXRoVHJhaXRUcmFpdEJ1aWxkZXJcbiAgICByZXR1cm4gdGhpcztcbiAgfSxcbiAgXG4gICdleHRlbmRzJzogZnVuY3Rpb24gKFRyYWl0KSB7XG4gICAgcmV0dXJuIHRoaXMuZXh0ZW5keihUcmFpdCk7XG4gIH0sXG4gIFxuICBib2R5OiBmdW5jdGlvbiAoYm9keSkge1xuICAgIGJvZHkgPSBib2R5IHx8IHt9O1xuICAgIGV4dGVuZCh0aGlzLkN0b3IucHJvdG90eXBlLCBib2R5KTtcbiAgICByZXR1cm4gdGhpcy5DdG9yO1xuICB9XG59O1xuXG5mdW5jdGlvbiBUcmFpdChuYW1lLCBib2R5KSB7XG4gIHZhciB0cmFpdEJ1aWxkZXIgPSBuZXcgVHJhaXRCdWlsZGVyKG5hbWUpO1xuICByZXR1cm4gYm9keSA/IHRyYWl0QnVpbGRlci5ib2R5KGJvZHkpIDogdHJhaXRCdWlsZGVyO1xufVxuXG5UcmFpdC5yZXF1aXJlZCA9IGZ1bmN0aW9uICgpIHtcbiAgdGhyb3cgbmV3IEVycm9yKFwiTm90IGltcGxlbWVudGVkXCIpO1xufTtcblxuZXhwb3J0cy5UcmFpdCA9IFRyYWl0O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL2xhbmcvVHJhaXQuanNcIixcIi9sYW5nXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIGNhc2VDbGFzc2lmeSA9IHJlcXVpcmUoJy4vY29tbW9uL2Nhc2VDbGFzc2lmeS5qcycpLmNhc2VDbGFzc2lmeTtcbnZhciBlcXVhbHMgPSByZXF1aXJlKCcuL2NvbW1vbi9lcXVhbHMuanMnKS5lcXVhbHM7XG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnLi9jb21tb24vZXh0ZW5kLmpzJykuZXh0ZW5kO1xudmFyIGlzSW5zdGFuY2VPZiA9IHJlcXVpcmUoJy4vY29tbW9uL2lzSW5zdGFuY2VPZi5qcycpLmlzSW5zdGFuY2VPZjtcbnZhciBtYXRjaCA9IHJlcXVpcmUoJy4vY29tbW9uL21hdGNoLmpzJykubWF0Y2g7XG52YXIgcmVzdWx0ID0gcmVxdWlyZSgnLi9jb21tb24vcmVzdWx0LmpzJykucmVzdWx0O1xudmFyIGlzRnVuY3Rpb24gPSByZXF1aXJlKCcuL2NvbW1vbi90eXBlQ2hlY2suanMnKS5pc0Z1bmN0aW9uO1xudmFyIGlzT2JqZWN0ID0gcmVxdWlyZSgnLi9jb21tb24vdHlwZUNoZWNrLmpzJykuaXNPYmplY3Q7XG52YXIgd3JhcCA9IHJlcXVpcmUoJy4vY29tbW9uL3dyYXAuanMnKS53cmFwO1xuXG52YXIgY29tbW9uID0ge1xuICBjYXNlQ2xhc3NpZnk6IGNhc2VDbGFzc2lmeSxcbiAgZXF1YWxzOiBlcXVhbHMsXG4gIGV4dGVuZDogZXh0ZW5kLFxuICBtYXRjaDogbWF0Y2gsXG4gIHJlc3VsdDogcmVzdWx0LFxuICBpc0Z1bmN0aW9uOiBpc0Z1bmN0aW9uLFxuICBpc09iamVjdDogaXNPYmplY3QsXG4gIHdyYXA6IHdyYXBcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gY29tbW9uO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL2xhbmcvY29tbW9uLmpzXCIsXCIvbGFuZ1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBJbmRleE91dE9mQm91bmRzRXhjZXB0aW9uID0gcmVxdWlyZSgnLi4vZXhjZXB0aW9uLmpzJykuSW5kZXhPdXRPZkJvdW5kc0V4Y2VwdGlvbjtcbnZhciBQcm9kdWN0ID0gcmVxdWlyZSgnLi4vLi4vUHJvZHVjdC5qcycpLlByb2R1Y3Q7XG5cbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL2V4dGVuZC5qcycpLmV4dGVuZDtcbnZhciBtYXRjaCA9IHJlcXVpcmUoJy4vbWF0Y2guanMnKS5tYXRjaDtcblxudmFyIGlzT2JqZWN0ID0gcmVxdWlyZSgnLi90eXBlQ2hlY2suanMnKS5pc09iamVjdDtcblxuLyoqXG4gKiAoYykgQW5ndWxhci5qc1xuICovXG52YXIgRk5fQVJHUyA9IC9eZnVuY3Rpb25cXHMqW15cXChdKlxcKFxccyooW15cXCldKilcXCkvbTtcbnZhciBGTl9BUkdfU1BMSVQgPSAvLC87XG52YXIgU1RSSVBfQ09NTUVOVFMgPSAvKChcXC9cXC8uKiQpfChcXC9cXCpbXFxzXFxTXSo/XFwqXFwvKSkvbWc7XG5cbi8qKlxuICogKGMpIEFuZ3VsYXIuanNcbiAqL1xuZnVuY3Rpb24gZ2V0QXJndW1lbnROYW1lcyhmbikge1xuICB2YXIgZm5UZXh0LCBhcmdEZWNsLCByZXMgPSBbXTtcblxuICBpZiAodHlwZW9mIGZuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgZm5UZXh0ID0gZm4udG9TdHJpbmcoKS5yZXBsYWNlKFNUUklQX0NPTU1FTlRTLCAnJyk7XG4gICAgYXJnRGVjbCA9IGZuVGV4dC5tYXRjaChGTl9BUkdTKTtcbiAgICBBcnJheS5wcm90b3R5cGUuZm9yRWFjaC5jYWxsKGFyZ0RlY2xbMV0uc3BsaXQoRk5fQVJHX1NQTElUKSwgZnVuY3Rpb24gKGFyZykge1xuICAgICAgcmVzLnB1c2goYXJnLnRyaW0oKSk7XG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4gcmVzO1xufVxuXG5mdW5jdGlvbiBnZXROYW1lKGZuKSB7XG4gIC8vIFRPRE86IENyb3NzLWJyb3dzZXI/XG4gIHJldHVybiBmbi5uYW1lO1xufVxuXG5mdW5jdGlvbiBjYXNlQ2xhc3NpZnkoQ3RvciwgbmFtZSwgZGVmYXVsdHMpIHtcbiAgXG4gIG5hbWUgPSBuYW1lIHx8IGdldE5hbWUoQ3Rvcik7XG4gIHZhciBhcmd1bWVudE5hbWVzID0gaXNPYmplY3QoZGVmYXVsdHMpID8gT2JqZWN0LmtleXMoZGVmYXVsdHMpIDogZ2V0QXJndW1lbnROYW1lcyhDdG9yKTtcbiAgXG4gIGRlZmF1bHRzID0gZGVmYXVsdHMgfHwge307IC8vIHByZXZlbnQgZXhjZXB0aW9uc1xuICBcbiAgdmFyIEZhY3RvcnkgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIEZhY3RvcnkuYXBwLmFwcGx5KHVuZGVmaW5lZCwgYXJndW1lbnRzKTtcbiAgfTtcblxuICAvLyBUT0RPOiBXaGF0IGlzIHRoZSBuYW1lIHByb3BlcnR5IGFueXdheT9cbiAgRmFjdG9yeS5uYW1lID0gbmFtZTtcblxuICBGYWN0b3J5Ll9fcHJvZHVjdF9fID0gbmFtZTtcblxuICBGYWN0b3J5LmZyb21KU09OID0gZnVuY3Rpb24gKGpzb25PYmopIHtcbiAgICB2YXIgY2MgPSBuZXcgQ3RvcigpO1xuICAgIE9iamVjdC5rZXlzKGpzb25PYmopLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgIGNjW25hbWVdID0ganNvbk9ialtuYW1lXSB8fCBkZWZhdWx0c1thcmd1bWVudE5hbWVzW2ldXTtcbiAgICB9KTtcbiAgICByZXR1cm4gY2M7XG4gIH07XG5cbiAgRmFjdG9yeS5hcHAgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGNjID0gbmV3IEN0b3IoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyZ3VtZW50TmFtZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNjW2FyZ3VtZW50TmFtZXNbaV1dID0gYXJndW1lbnRzW2ldIHx8IGRlZmF1bHRzW2FyZ3VtZW50TmFtZXNbaV1dO1xuICAgIH1cbiAgICByZXR1cm4gY2M7XG4gIH07XG5cbiAgRmFjdG9yeS51bkFwcCA9IGZ1bmN0aW9uIChjYykge1xuICAgIHJldHVybiBhcmd1bWVudE5hbWVzLm1hcChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgcmV0dXJuIGNjW25hbWVdO1xuICAgIH0pO1xuICB9O1xuXG4gIGV4dGVuZChDdG9yLnByb3RvdHlwZSwgUHJvZHVjdC5wcm90b3R5cGUpO1xuICBleHRlbmQoQ3Rvci5wcm90b3R5cGUsIHtcblxuICAgIC8vIFRPRE86IEJldHRlciBuYW1lP1xuICAgIF9fZmFjdG9yeV9fOiBGYWN0b3J5LFxuXG4gICAgbmFtZTogbmFtZSxcblxuICAgIGNvcHk6IGZ1bmN0aW9uIChwYXRjaE9iaikge1xuICAgICAgdmFyIGNvcHkgPSBuZXcgQ3Rvcih7fSk7XG4gICAgICBhcmd1bWVudE5hbWVzLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgaWYgKHBhdGNoT2JqW25hbWVdKSBjb3B5W25hbWVdID0gcGF0Y2hPYmpbbmFtZV07XG4gICAgICAgIGVsc2UgY29weVtuYW1lXSA9IHRoaXNbbmFtZV07XG4gICAgICB9LCB0aGlzKTtcbiAgICAgIHJldHVybiBjb3B5O1xuICAgIH0sXG5cbiAgICBwcm9kdWN0QXJpdHk6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBhcmd1bWVudE5hbWVzLmxlbmd0aDtcbiAgICB9LFxuXG4gICAgcHJvZHVjdEVsZW1lbnQ6IGZ1bmN0aW9uIChuKSB7XG4gICAgICBpZiAobiA8IGFyZ3VtZW50TmFtZXMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiB0aGlzW2FyZ3VtZW50TmFtZXNbbl1dO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEluZGV4T3V0T2ZCb3VuZHNFeGNlcHRpb24oKTtcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgcHJvZHVjdFByZWZpeDogbmFtZSxcblxuICAgIC8qXG4gICAgIGVxdWFsczogZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgIGlmIChvdGhlci5pc0luc3RhbmNlT2YoUHJvZHVjdCkpIHtcbiAgICAgaWYgKHRoaXMucHJvZHVjdEFyaXR5KCkgPT09IG90aGVyLnByb2R1Y3RBcml0eSgpKSB7XG4gICAgIHJldHVybiB0aGlzLnByb2R1Y3RJdGVyYXRvcigpLnNhbWVFbGVtZW50cyhvdGhlci5wcm9kdWN0SXRlcmF0b3IoKSk7XG4gICAgIH1cbiAgICAgfVxuXG4gICAgIHJldHVybiBmYWxzZTtcbiAgICAgfSxcbiAgICAgKi9cblxuICAgIGhhc2hDb2RlOiBmdW5jdGlvbiAoKSB7XG4gICAgICBjb25zb2xlLndhcm4oXCJoYXNoQ29kZSBpbXBsZW1lbnRhdGlvbiBtaXNzaW5nXCIpO1xuICAgICAgcmV0dXJuIC0xO1xuICAgIH0sXG5cbiAgICAvKlxuICAgICB0b1N0cmluZzogZnVuY3Rpb24gKCkge1xuICAgICByZXR1cm4gdGhpcy5wcm9kdWN0SXRlcmF0b3IoKS5ta1N0cmluZyh0aGlzLnByb2R1Y3RQcmVmaXggKyBcIihcIiwgXCIsXCIsIFwiKVwiKTtcbiAgICAgfSxcbiAgICAgKi9cblxuICAgIC8vIHRoaXMgaXNuJ3QgcmVhbGx5IHJlcXVpcmVkLiBKU09OLnN0cmluZ2lmeSB3b3JrcyBhbnl3YXkuLi5cbiAgICB0b0pTT046IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciByZXMgPSB7fTtcbiAgICAgIGFyZ3VtZW50TmFtZXMubWFwKGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgIHJlc1tuYW1lXSA9IHRoaXNbbmFtZV07XG4gICAgICB9LCB0aGlzKTtcbiAgICAgIHJldHVybiByZXM7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFN0YXJ0IGEgcHNldWRvIHBhdHRlcm4gbWF0Y2hcbiAgICAgKiBAcmV0dXJuIHsqfVxuICAgICAqL1xuICAgIG1hdGNoOiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gbWF0Y2godGhpcyk7XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4gRmFjdG9yeTtcbn1cblxuZXhwb3J0cy5jYXNlQ2xhc3NpZnkgPSBjYXNlQ2xhc3NpZnk7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvbGFuZy9jb21tb24vY2FzZUNsYXNzaWZ5LmpzXCIsXCIvbGFuZy9jb21tb25cIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5mdW5jdGlvbiBlcXVhbHMobzEsIG8yKSB7XG4gIGlmIChvMS5lcXVhbHMpIHtcbiAgICBpZiAobzIuZXF1YWxzKSB7XG4gICAgICByZXR1cm4gbzEuZXF1YWxzKG8yKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAobzIuZXF1YWxzKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBvMSA9PT0gbzI7XG4gICAgfVxuICB9XG59XG5cbmV4cG9ydHMuZXF1YWxzID0gZXF1YWxzO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL2xhbmcvY29tbW9uL2VxdWFscy5qc1wiLFwiL2xhbmcvY29tbW9uXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuZnVuY3Rpb24gZXh0ZW5kKG9iaiwgYnkpIHtcbiAgYnkgPSBieSB8fCB7fTtcbiAgT2JqZWN0LmtleXMoYnkpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgIG9ialtrZXldID0gYnlba2V5XTtcbiAgfSk7XG4gIHJldHVybiBvYmo7XG59XG5cbmV4cG9ydHMuZXh0ZW5kID0gZXh0ZW5kO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL2xhbmcvY29tbW9uL2V4dGVuZC5qc1wiLFwiL2xhbmcvY29tbW9uXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIGlzU3RyaW5nID0gcmVxdWlyZSgnLi90eXBlQ2hlY2suanMnKS5pc1N0cmluZztcblxuLy8gVE9ETzogbGVzcyBmdWNrdXBcbmZ1bmN0aW9uIGlzSW5zdGFuY2VPZih0aGF0LCBjbGFzc0xpa2UpIHtcbiAgaWYgKGlzU3RyaW5nKGNsYXNzTGlrZSkpIHtcbiAgICByZXR1cm4gdGhhdFsnX18nICsgY2xhc3NMaWtlICsgJ19fJ10gPT09IHRydWU7XG4gIH0gZWxzZSBpZiAoY2xhc3NMaWtlLl9fbmFtZV9fKSB7XG4gICAgcmV0dXJuIHRoYXRbJ19fJyArIGNsYXNzTGlrZS5fX25hbWVfXyArICdfXyddID09PSB0cnVlO1xuICB9IGVsc2UgaWYgKGNsYXNzTGlrZS5wcm90b3R5cGUuX19uYW1lX18pIHtcbiAgICByZXR1cm4gdGhhdFsnX18nICsgY2xhc3NMaWtlLnByb3RvdHlwZS5fX25hbWVfXyArICdfXyddID09PSB0cnVlO1xuICB9IGVsc2UgaWYgKGNsYXNzTGlrZS5fX3Byb2R1Y3RfXykge1xuICAgIHJldHVybiB0aGF0WydfXycgKyBjbGFzc0xpa2UuX19wcm9kdWN0X18gKyAnX18nXSA9PT0gdHJ1ZTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gdGhhdCBpbnN0YW5jZW9mIGNsYXNzTGlrZTtcbiAgfVxufVxuXG5leHBvcnRzLmlzSW5zdGFuY2VPZiA9IGlzSW5zdGFuY2VPZjtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIxWWlaNVNcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi9sYW5nL2NvbW1vbi9pc0luc3RhbmNlT2YuanNcIixcIi9sYW5nL2NvbW1vblwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBlcXVhbHMgPSByZXF1aXJlKCcuL2VxdWFscy5qcycpLmVxdWFscztcbnZhciBleHRlbmQgPSByZXF1aXJlKCcuL2V4dGVuZC5qcycpLmV4dGVuZDtcbnZhciBpc0Z1bmN0aW9uID0gcmVxdWlyZSgnLi90eXBlQ2hlY2suanMnKS5pc0Z1bmN0aW9uO1xuXG4vKipcbiAqIEB0ZW1wbGF0ZSBCXG4gKiBAdGVtcGxhdGUgUlxuICogQHBhcmFtIG8ge0J9IEFueSBKUyB2YWx1ZSB0byBtYXRjaCBhZ2FpbnN0LlxuICogQGNvbnN0cnVjdG9yXG4gKi9cbmZ1bmN0aW9uIENhc2Uobykge1xuICB0aGlzLm8gPSBvO1xufVxuXG5DYXNlLnByb3RvdHlwZSA9IHtcblxuICAvKipcbiAgICpcbiAgICogQHBhcmFtIHtCfSBvdGhlciAtIEFuIGFyYml0cmFyeSBvYmplY3QgdG8gY29tcGFyZSB0b1xuICAgKiBAcGFyYW0ge2Z1bmN0aW9uKEIpOiBSfSBmIC0gQSBjYWxsYmFjayBmdW5jdGlvbiBpZiBpdCBpcyBhIG1hdGNoLlxuICAgKiBAcGFyYW0ge29iamVjdD19IGNvbnRleHRcbiAgICogQHJldHVybiB7TWF0Y2h8Q2FzZX1cbiAgICovXG4gIGNhemU6IGZ1bmN0aW9uIChvdGhlciwgZiwgY29udGV4dCkge1xuICAgIGlmIChvdGhlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4gdGhpcy5kb0Nhc2Uob3RoZXIsIGYsIGNvbnRleHQpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdGhpcy5kZWZhdWx0KGYsIGNvbnRleHQpLmdldCgpO1xuICAgIH1cbiAgfSxcbiAgXG4gICdjYXNlJzogZnVuY3Rpb24gKG90aGVyLCBmLCBjb250ZXh0KSB7XG4gICAgcmV0dXJuIHRoaXMuY2F6ZShvdGhlciwgZiwgY29udGV4dCk7XG4gIH0sXG5cbiAgZG9DYXNlOiBmdW5jdGlvbiAob3RoZXIsIGYsIGNvbnRleHQpIHtcbiAgICByZXR1cm4gKGVxdWFscyh0aGlzLm8sIG90aGVyKSkgP1xuICAgICAgbmV3IE1hdGNoKGYuY2FsbChjb250ZXh0LCB0aGlzLm8pKSA6XG4gICAgICB0aGlzO1xuICB9LFxuXG4gIC8qKlxuICAgKiBDYW4ndCBnZXQgYSByZXN1bHQgYmVmb3JlIGEgbWF0Y2hpbmcgcGF0dGVybiBoYXMgYmVlbiBmb3VuZC5cbiAgICogQHRocm93cyB7RXJyb3J9XG4gICAqL1xuICBnZXR6OiBmdW5jdGlvbiAoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiTWF0Y2hFcnJvclwiKTtcbiAgfSxcbiAgXG4gICdnZXQnOiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0eigpO1xuICB9LFxuICBcbiAgZGVmYXVsdHo6IGZ1bmN0aW9uIChmLCBjb250ZXh0KSB7XG4gICAgcmV0dXJuIG5ldyBNYXRjaChmLmNhbGwoY29udGV4dCwgdGhpcy5vKSkuZ2V0KCk7XG4gIH0sXG5cbiAgJ2RlZmF1bHQnOiBmdW5jdGlvbiAoZiwgY29udGV4dCkge1xuICAgIHJldHVybiB0aGlzLmRlZmF1bHR6KGYsIGNvbnRleHQpO1xuICB9XG59O1xuXG4vKipcbiAqIE1hdGNoaW5nIGFnYWluc3QgYSBzY2FsYWlzaCBvYmplY3QuXG4gKiBUaGlzIG1lYW5zIGEgYGlzSW5zdGFuY2VPZmAgbWV0aG9kIGlzIHByZXNlbnQuXG4gKlxuICogQHBhcmFtIHtBbnl9IG8gLSBBIHNjYWxhaXNoIG9iamVjdFxuICogQGNvbnN0cnVjdG9yXG4gKiBAZXh0ZW5kcyB7Q2FzZX1cbiAqL1xuZnVuY3Rpb24gQ2FzZUNsYXNzQ2FzZShvKSB7XG4gIENhc2UuY2FsbCh0aGlzLCBvKTtcbn1cblxudmFyIHVuQXBwID0gZnVuY3Rpb24gKENsYXNzLCBvKSB7XG4vLyBUT0RPOiByZWN1cnNpdmUgdW5BcHBcbiAgcmV0dXJuIENsYXNzLnVuQXBwID9cbiAgICBDbGFzcy51bkFwcChvKSA6XG4gICAgW29dO1xufTtcblxuQ2FzZUNsYXNzQ2FzZS5wcm90b3R5cGUgPSBleHRlbmQoT2JqZWN0LmNyZWF0ZShDYXNlLnByb3RvdHlwZSksIHtcblxuICAvKipcbiAgICogQHBhcmFtIHtGYWN0b3J5fSBDbGFzcyAtIFRoZSBmYWN0b3J5IG1ldGhvZCAocHNldWRvIGNvbXBhbmlvbiBvYmplY3QpIG9mIGEgc2NhbGFpc2ggY2xhc3NcbiAgICogQHBhcmFtIHtmdW5jdGlvbihCKTogUn0gZlxuICAgKiBAcGFyYW0ge29iamVjdD19IGNvbnRleHRcbiAgICogQHJldHVybiB7TWF0Y2h8Q2FzZUNsYXNzQ2FzZX1cbiAgICovXG4gIGRvQ2FzZTogZnVuY3Rpb24gKENsYXNzLCBmLCBjb250ZXh0KSB7XG4gICAgcmV0dXJuICh0aGlzLm8uX19mYWN0b3J5X18uX19wcm9kdWN0X18gPT09IENsYXNzLl9fcHJvZHVjdF9fKSA/XG4gICAgICBuZXcgTWF0Y2goZi5hcHBseShjb250ZXh0LCB1bkFwcChDbGFzcywgdGhpcy5vKSkpIDpcbiAgICAgIHRoaXM7XG4gIH1cbn0pO1xuXG4vKipcbiAqIE1hdGNoaW5nIGFnYWluc3QgYSBKUyBvYmplY3QuXG4gKiBUaGlzIG1lYW5zIGEgdGhlIGBpbnN0YWNlb2ZgIG9wZXJhdG9yIGlzIHVzZWQuXG4gKlxuICogQHBhcmFtIHtvYmplY3R9IG9cbiAqIEBjb25zdHJ1Y3RvclxuICogQGV4dGVuZHMge0Nhc2V9XG4gKi9cbmZ1bmN0aW9uIENvbnN0cnVjdG9yQ2FzZShvKSB7XG4gIENhc2UuY2FsbCh0aGlzLCBvKTtcbn1cblxuQ29uc3RydWN0b3JDYXNlLnByb3RvdHlwZSA9IGV4dGVuZChPYmplY3QuY3JlYXRlKENhc2UucHJvdG90eXBlKSwge1xuXG4gIC8qKlxuICAgKiBSZXR1cm5zIGEgYE1hdGNoYCBpZiBgdGhpcy5vYCBoYXMgYmVlbiBjcmVhdGVkIHdpdGggdGhlIGNvbnN0cnVjdG9yIGBDbGFzc2AuXG4gICAqXG4gICAqIEBwYXJhbSB7ZnVuY3Rpb259IENsYXNzIC0gQSByZWd1bGFyIEpTIGNvbnN0cnVjdG9yIGZ1bmN0aW9uXG4gICAqIEBwYXJhbSB7ZnVuY3Rpb24oQik6IFJ9IGZcbiAgICogQHBhcmFtIHtvYmplY3Q9fSBjb250ZXh0XG4gICAqIEByZXR1cm4ge01hdGNofENvbnN0cnVjdG9yQ2FzZX1cbiAgICovXG4gIGRvQ2FzZTogZnVuY3Rpb24gKENsYXNzLCBmLCBjb250ZXh0KSB7XG4gICAgcmV0dXJuICh0aGlzLm8gaW5zdGFuY2VvZiBDbGFzcykgP1xuICAgICAgbmV3IE1hdGNoKGYuY2FsbChjb250ZXh0LCB0aGlzLm8pKSA6XG4gICAgICB0aGlzO1xuICB9XG59KTtcblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgbWF0Y2guXG4gKiBBbGwgZnVydGhlciBjYWxscyB0byAnY2FzZScgd2lsbCBiZSBpZ25vcmVkLlxuICpcbiAqIEBwYXJhbSB7Un0gcmVzIFRoZSByZXN1bHQgb2YgdGhlIGNhc2UgY2FsbGJhY2sgZnVuY3Rpb25cbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBNYXRjaChyZXMpIHtcbiAgdGhpcy5yZXMgPSByZXM7XG59XG5cbk1hdGNoLnByb3RvdHlwZSA9IHtcbiAgLyoqXG4gICAqIEByZXR1cm4ge01hdGNofCp9XG4gICAqL1xuICBjYXplOiBmdW5jdGlvbiAob3RoZXIpIHtcbiAgICBpZiAob3RoZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB0aGlzLmdldHooKTtcbiAgICB9XG4gIH0sXG4gIFxuICAnY2FzZSc6IGZ1bmN0aW9uIChvdGhlcikge1xuICAgIHJldHVybiB0aGlzLmNhemUob3RoZXIpO1xuICB9LFxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSByZXN1bHQgb2YgdGhlIGNhbGxiYWNrIG9mIHRoZSBtYXRjaGluZyBjYXNlLlxuICAgKiBUaGlzIGNhbGwgdG8gcmVzIGlzIG9wdGlvbmFsIGlmIHlvdSBhcmUgbm90IGludGVyZXN0ZWQgaW4gdGhlIHJlc3VsdC5cbiAgICogQHJldHVybiB7Un1cbiAgICovXG4gIGdldHo6IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5yZXM7XG4gIH0sXG4gIFxuICAnZ2V0JzogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLnJlcztcbiAgfVxufTtcblxuLyoqXG4gKiBTdGFydHMgYSBwc2V1ZG8gcGF0dGVybi1tYXRjaC5cbiAqXG4gKiBAcGFyYW0geyp9IG9cbiAqIEByZXR1cm4ge0Nhc2V9XG4gKi9cbmZ1bmN0aW9uIG1hdGNoKG8pIHtcbiAgaWYgKG8uX19mYWN0b3J5X18gJiYgby5fX2ZhY3RvcnlfXy51bkFwcCkge1xuICAgIHJldHVybiBuZXcgQ2FzZUNsYXNzQ2FzZShvKTtcbiAgICAvL30gZWxzZSBpZiAoby5fX0FueV9fKSB7XG4gICAgLy8gcmV0dXJuIG5ldyBDbGFzc0Nhc2Uobyk7XG4gIH0gZWxzZSBpZiAoaXNGdW5jdGlvbihvKSkge1xuICAgIHJldHVybiBuZXcgQ29uc3RydWN0b3JDYXNlKG8pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBuZXcgQ2FzZShvKTtcbiAgfVxufVxuXG5leHBvcnRzLm1hdGNoID0gbWF0Y2g7XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvbGFuZy9jb21tb24vbWF0Y2guanNcIixcIi9sYW5nL2NvbW1vblwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBpc0Z1bmN0aW9uID0gcmVxdWlyZSgnLi90eXBlQ2hlY2suanMnKS5pc0Z1bmN0aW9uO1xuXG5mdW5jdGlvbiByZXN1bHQodmFsdWUsIGNvbnRleHQpIHtcbiAgcmV0dXJuIGlzRnVuY3Rpb24odmFsdWUpID8gdmFsdWUuY2FsbChjb250ZXh0KSA6IHZhbHVlO1xufVxuXG5leHBvcnRzLnJlc3VsdCA9IHJlc3VsdDtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIxWWlaNVNcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi9sYW5nL2NvbW1vbi9yZXN1bHQuanNcIixcIi9sYW5nL2NvbW1vblwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcblsnRnVuY3Rpb24nLCAnT2JqZWN0J11cbiAgLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICBleHBvcnRzWydpcycgKyBuYW1lXSA9IGZ1bmN0aW9uIChvYmopIHtcbiAgICAgIHJldHVybiB0eXBlb2Ygb2JqID09PSBuYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgfVxuICB9KTtcblxuZXhwb3J0cy5pc1N0cmluZyA9IGZ1bmN0aW9uIChzKSB7XG4gIHJldHVybiB0eXBlb2YgcyA9PT0gJ3N0cmluZyc7XG59O1xuXG5leHBvcnRzLmlzQXJyYXkgPSBmdW5jdGlvbiAoYXJyKSB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KGFycik7XG59O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL2xhbmcvY29tbW9uL3R5cGVDaGVjay5qc1wiLFwiL2xhbmcvY29tbW9uXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xudmFyIGV4dGVuZCA9IHJlcXVpcmUoJy4vZXh0ZW5kLmpzJykuZXh0ZW5kO1xudmFyIGlzRnVuY3Rpb24gPSByZXF1aXJlKCcuL3R5cGVDaGVjay5qcycpLmlzRnVuY3Rpb247XG5cbmZ1bmN0aW9uIHdyYXAodGFyZ2V0KSB7XG4gIGZ1bmN0aW9uIFdyYXBwZWQgKCkge1xuICAgIHJldHVybiB0YXJnZXQuYXBwLmFwcGx5KHRhcmdldCwgYXJndW1lbnRzKTtcbiAgfVxuICBcbiAgT2JqZWN0LmtleXModGFyZ2V0KS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICB2YXIgdmFsdWUgPSB0YXJnZXRba2V5XTtcbiAgICBpZiAoaXNGdW5jdGlvbih2YWx1ZSkpIHtcbiAgICAgIFdyYXBwZWRba2V5XSA9IHZhbHVlLmJpbmQodGFyZ2V0KTtcbiAgICB9IGVsc2Uge1xuICAgICAgV3JhcHBlZFtrZXldID0gdmFsdWU7XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4gV3JhcHBlZDtcbn1cblxuZXhwb3J0cy53cmFwID0gd3JhcDtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIxWWlaNVNcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi9sYW5nL2NvbW1vbi93cmFwLmpzXCIsXCIvbGFuZy9jb21tb25cIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgQ2xhc3MgPSByZXF1aXJlKCcuL0NsYXNzLmpzJykuQ2xhc3M7XG5cbnZhciBUaHJvd2FibGUgPSBDbGFzcyhcIlRocm93YWJsZVwiKS5leHRlbmRzKEVycm9yKS5ib2R5KHtcbiAgY29uc3RydWN0b3I6IGZ1bmN0aW9uIChtZXNzYWdlLCBmaWxlTmFtZSwgbGluZU51bWJlcikge1xuICAgIEVycm9yLmNhbGwodGhpcywgYXJndW1lbnRzKTtcbiAgICBFcnJvci5jYXB0dXJlU3RhY2tUcmFjZSh0aGlzLCB0aGlzLnByb3RvdHlwZSk7XG5cbiAgICBpZiAobWVzc2FnZSkgdGhpcy5tZXNzYWdlID0gbWVzc2FnZTtcbiAgICBpZiAoZmlsZU5hbWUpIHRoaXMuZmlsZU5hbWUgPSBmaWxlTmFtZTtcbiAgICBpZiAobGluZU51bWJlcikgdGhpcy5saW5lTnVtYmVyID0gbGluZU51bWJlcjtcbiAgfVxufSk7XG5cbnZhciBFeGNlcHRpb24gPSBDbGFzcyhcIkV4Y2VwdGlvblwiKS5leHRlbmRzKFRocm93YWJsZSkuYm9keSh7fSk7XG52YXIgUnVudGltZUV4Y2VwdGlvbiA9IENsYXNzKFwiUnVudGltZUV4Y2VwdGlvblwiKS5leHRlbmRzKEV4Y2VwdGlvbikuYm9keSh7fSk7XG52YXIgTm9TdWNoRWxlbWVudEV4Y2VwdGlvbiA9IENsYXNzKFwiTm9TdWNoRWxlbWVudEV4Y2VwdGlvblwiKS5leHRlbmRzKFJ1bnRpbWVFeGNlcHRpb24pLmJvZHkoe30pO1xudmFyIFVuc3VwcG9ydGVkT3BlcmF0aW9uRXhjZXB0aW9uID0gQ2xhc3MoXCJVbnN1cHBvcnRlZE9wZXJhdGlvbkV4Y2VwdGlvblwiKS5leHRlbmRzKFJ1bnRpbWVFeGNlcHRpb24pLmJvZHkoe30pO1xudmFyIEluZGV4T3V0T2ZCb3VuZHNFeGNlcHRpb24gPSBDbGFzcyhcIkluZGV4T3V0T2ZCb3VuZHNFeGNlcHRpb25cIikuZXh0ZW5kcyhSdW50aW1lRXhjZXB0aW9uKS5ib2R5KHt9KTtcbnZhciBJbGxlZ2FsQXJndW1lbnRFeGNlcHRpb24gPSBDbGFzcyhcIklsbGVnYWxBcmd1bWVudEV4Y2VwdGlvblwiKS5leHRlbmRzKFJ1bnRpbWVFeGNlcHRpb24pLmJvZHkoe30pO1xuLy8gVE9ET1xuXG5leHBvcnRzLlRocm93YWJsZSA9IFRocm93YWJsZTtcbmV4cG9ydHMuRXhjZXB0aW9uID0gRXhjZXB0aW9uO1xuZXhwb3J0cy5SdW50aW1lRXhjZXB0aW9uID0gUnVudGltZUV4Y2VwdGlvbjtcbmV4cG9ydHMuTm9TdWNoRWxlbWVudEV4Y2VwdGlvbiA9IE5vU3VjaEVsZW1lbnRFeGNlcHRpb247XG5leHBvcnRzLlVuc3VwcG9ydGVkT3BlcmF0aW9uRXhjZXB0aW9uID0gVW5zdXBwb3J0ZWRPcGVyYXRpb25FeGNlcHRpb247XG5leHBvcnRzLkluZGV4T3V0T2ZCb3VuZHNFeGNlcHRpb24gPSBJbmRleE91dE9mQm91bmRzRXhjZXB0aW9uO1xuZXhwb3J0cy5JbGxlZ2FsQXJndW1lbnRFeGNlcHRpb24gPSBJbGxlZ2FsQXJndW1lbnRFeGNlcHRpb247XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvbGFuZy9leGNlcHRpb24uanNcIixcIi9sYW5nXCIpIl19
