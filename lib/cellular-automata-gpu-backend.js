"use strict";

//TODO support OffscreenCanvas for WebWorker support https://platform-status.mozilla.org/#offscreencanvas

var isNode = !!(typeof process != 'undefined' && process.versions && process.versions.node);

var getContext;

if (!isNode) {
    getContext = function getContext (canvas) {
        var context,
            glOptions = {
                alpha: false,
                depth: false,
                stencil: false,
                antialias: false,
                preserveDrawingBuffer: true
            };

        try {
            context = canvas.getContext('webgl2', glOptions) || canvas.getContext('webgl', glOptions) || canvas.getContext('experimental-webgl', glOptions);

            context.disable(context.DEPTH_TEST);
            context.disable(context.DITHER);
        } catch (e) {
            throw new Error('Could not initialize WebGL context : ' + e.message);
        }

        if (!context) {
            throw new Error('Could not initialize WebGL context');
        }

        return context;
    };
} else {
    getContext = function getContext () {
        var context,
            glOptions = {
                alpha: false,
                depth: false,
                stencil: false,
                antialias: false,
                preserveDrawingBuffer: true
            };

        try {
            context = require('gl')(64, 64, glOptions);

            context.disable(context.DEPTH_TEST);
            context.disable(context.DITHER);
        } catch (e) {
            throw new Error('Could not initialize WebGL context : ' + e.message);
        }

        if (!context) {
            throw new Error('Could not initialize WebGL context');
        }

        return context;
    };
}

/**
 * Create the surface to draw onto
 * @param {WebGLRenderingContext} context
 * @returns {WebGLBuffer} Buffer of the surface
 */
var createBuffer = function createBuffer(context) {
    var triangleVertexPositionBuffer = context.createBuffer();
    context.bindBuffer(context.ARRAY_BUFFER, triangleVertexPositionBuffer);
    context.bufferData(context.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 4, 4, -1]), context.STATIC_DRAW);
    triangleVertexPositionBuffer.itemSize = 2;
    triangleVertexPositionBuffer.numItems = 3;

    return triangleVertexPositionBuffer;
};

/**
 * Create a target for rendering
 * @param {WebGLRenderingContext} context
 * @param {int} width
 * @param {int} height
 * @returns {{texture: WebGLTexture, framebuffer: WebGLFrameBuffer}}
 */
var createTarget = function createTarget(context, width, height) {
    var target = {
        texture : context.createTexture(),
        framebuffer : context.createFramebuffer()
    };

    context.bindTexture(context.TEXTURE_2D, target.texture);
    context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, width, height, 0, context.RGBA, context.UNSIGNED_BYTE, null);

    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.NEAREST);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.NEAREST);

    context.bindFramebuffer(context.FRAMEBUFFER, target.framebuffer);
    context.framebufferTexture2D(context.FRAMEBUFFER, context.COLOR_ATTACHMENT0, context.TEXTURE_2D, target.texture, 0);

    context.bindTexture(context.TEXTURE_2D, null);
    context.bindFramebuffer(context.FRAMEBUFFER, null);

    return target;
};

/**
 * Create a shader
 * @param {WebGLRenderingContext} context
 * @param {int} type FRAGMENT_SHADER or VERTEX_SHADER
 * @param {string} src Source of the shader
 * @returns {WebGLShader}
 */
var createShader = function createShader(context, type, src) {
    var shader = context.createShader(type);
    context.shaderSource( shader, src );
    context.compileShader( shader );

    if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
        throw new Error('Error creating shader : ' + context.getShaderInfoLog(shader) + '\n' + src);
    }

    return shader;
};

/**
 * Create a program
 * @param {WebGLRenderingContext} context
 * @param {{vertexShader:string, fragmentShader:string}} shaders
 * @returns {WebGLProgram}
 */
var createProgram = function createProgram(context, shaders) {
    var shaderProgram = context.createProgram(),
        vertexShader = createShader(context, context.VERTEX_SHADER, shaders.vertexShader),
        fragmentShader = createShader(context, context.FRAGMENT_SHADER, shaders.fragmentShader );

    context.attachShader(shaderProgram, vertexShader);
    context.attachShader(shaderProgram, fragmentShader);

    context.linkProgram(shaderProgram);

    if (!context.getProgramParameter(shaderProgram, context.LINK_STATUS)) {
        throw new Error('Could not initialise shaders');
    }

    shaderProgram.vertexPositionAttribute = context.getAttribLocation(shaderProgram, 'aVertexPosition');
    context.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);
    shaderProgram.iBackbuffer = context.getUniformLocation(shaderProgram, 'iBackbuffer');

    return shaderProgram;
};

/**
 * Initialize a WebGL-based backend
 * @param {Array} shape
 * @constructor
 */
var GpuBackend = function GpuBackend (shape) {
    if (!isNode) {
        this.canvas = document.createElement('canvas');
    }

    this.context = getContext(this.canvas);

    this.setShape(shape);
};

GpuBackend.prototype.shape = null;
GpuBackend.prototype.viewportWidth = null;
GpuBackend.prototype.viewportHeight = null;

GpuBackend.prototype.canvas = null;
GpuBackend.prototype.context = null;
GpuBackend.prototype.triangle = null;

GpuBackend.prototype.rgbaTextureData = null;
GpuBackend.prototype.frontTarget = null;
GpuBackend.prototype.backTarget = null;

/**
 * Set the shape
 * @param {Array} shape
 * @protected
 */
GpuBackend.prototype.setShape = function (shape) {
    this.shape = shape;

    var width = shape[0],
        height = shape[1];

    this.viewportWidth = width;
    this.viewportHeight = height;

    if (!isNode) {
        this.canvas.width = width;
        this.canvas.height = height;
    } else {
        this.context.resize(width, height);
    }

    this.rgbaTextureData = new Uint8Array(this.viewportWidth * this.viewportHeight * 4);
    this.frontTarget = createTarget(this.context, width, height);
    this.backTarget = createTarget(this.context, width, height);
    this.triangle = createBuffer(this.context);
};

/**
 * Execute a given rule for all its iterations
 * @param {object} rule
 * @public
 */
GpuBackend.prototype.execute = function (rule) {
    var shaders = rule.shaders,
        iteration = rule.iteration,
        shaderProgram = createProgram(this.context, shaders);

    for (var i = 0; i < iteration; i++) {
        this.swapRenderingTargets();
        this.executeProgram(shaderProgram);
    }
};

/**
 * Swap the front and the back target
 * @protected
 */
GpuBackend.prototype.swapRenderingTargets = function () {
    var tmp = this.frontTarget;
    this.frontTarget = this.backTarget;
    this.backTarget = tmp;
};

/**
 * Execute a given WebGLProgram once
 * @param {WebGLProgram} shaderProgram
 * @protected
 */
GpuBackend.prototype.executeProgram = function (shaderProgram) {
    var gl = this.context,
        buffer = this.triangle;

    //TODO try to reduce the number of WebGl calls

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(shaderProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(shaderProgram.vertexPositionAttribute, buffer.itemSize, gl.FLOAT, false, 0, 0);

    // use backbuffer
    gl.uniform1i(shaderProgram.iBackbuffer, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.backTarget.texture);

    // render to front buffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.frontTarget.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, buffer.numItems);
};

/**
 * Read the current state from the texture
 * @returns {int[]} State as a flat array
 * @public
 */
GpuBackend.prototype.read = function () {
    //TODO should write directly to an ndarray passed as argument

    var gl = this.context,
        data = this.rgbaTextureData,
        processedData = [];

    gl.readPixels(0, 0, this.viewportWidth, this.viewportHeight, gl.RGBA, gl.UNSIGNED_BYTE, data);

    for(var i = 0; i < data.length; i += 4) {
        processedData.push(data[i]);
    }

    return processedData;
};

/**
 * Write the current state to the texture
 * @param {object} array Instance of ndarray
 * @param {array} shape Shape of the ndarray
 * @public
 */
GpuBackend.prototype.write = function (array, shape) {
    //TODO remove the need for the shape argument

    var data = this.rgbaTextureData,
        gl = this.context,
        x,
        y,
        i;

    for (y = 0; y < shape[1]; y++) {
        for (x = 0; x < shape[0]; x++) {
            i = (x + y * shape[0]) * 4;

            data[i] = data[i + 1] = data[i + 2] = data[i + 3] = array.get(x,y);
        }
    }

    gl.bindTexture(gl.TEXTURE_2D, this.frontTarget.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.viewportWidth, this.viewportHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.bindTexture(gl.TEXTURE_2D, null);
};

module.exports = GpuBackend;
