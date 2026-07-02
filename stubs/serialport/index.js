'use strict'

/* eslint-disable @typescript-eslint/explicit-function-return-type */

class SerialPort {
  constructor() {
    throw new Error('Serial RTU is not available in this build. Use Modbus TCP instead.')
  }

  static async list() {
    return []
  }
}

module.exports = {
  SerialPort
}
