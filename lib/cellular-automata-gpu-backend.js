"use strict";

var getContext = function getContext (canvas) {
    var context,
        glOptions = {
            alpha: false,
            depth: false,
            stencil: false,
            antialias: false,
            preserveDrawingBuffer: true
        };

    try {
        context = canvas.getContext('webgl', glOptions) || canvas.getContext('experimental-webgl', glOptions);

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

var initBuffers = function initBuffers(context) {
    var triangleVertexPositionBuffer = context.createBuffer();
    context.bindBuffer(context.ARRAY_BUFFER, triangleVertexPositionBuffer);
    context.bufferData(context.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 4, 4, -1]), context.STATIC_DRAW);
    triangleVertexPositionBuffer.itemSize = 2;
    triangleVertexPositionBuffer.numItems = 3;

    return triangleVertexPositionBuffer;
};

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

var createShader = function createShader(context, type, src) {
    var shader = context.createShader(type);
    context.shaderSource( shader, src );
    context.compileShader( shader );

    if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
        throw new Error('Error creating shader : ' + context.getShaderInfoLog(shader) + '\n' + src);
    }

    return shader;
};

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

var GpuBackend = function GpuBackend (shape) {
    this.canvas = document.createElement('canvas');
    this.context = getContext(this.canvas);

    this.setShape(shape);
};

GpuBackend.prototype.shape = null;
GpuBackend.prototype.viewportWidth = null;
GpuBackend.prototype.viewportHeight = null;

GpuBackend.prototype.canvas = null;
GpuBackend.prototype.context = null;
GpuBackend.prototype.triangle = null;

GpuBackend.prototype.frontTarget = null;
GpuBackend.prototype.backTarget = null;

GpuBackend.prototype.setShape = function (shape) {
    this.shape = shape;

    var width = shape[0],
        height = shape[1];

    this.viewportWidth = this.canvas.width = width;
    this.viewportHeight = this.canvas.height = height;

    this.frontTarget = createTarget(this.context, width, height);
    this.backTarget = createTarget(this.context, width, height);
    this.triangle = initBuffers(this.context);
};


GpuBackend.prototype.execute = function (rule) {
    var shaders = rule.shaders,
        iteration = rule.iteration,
        shaderProgram = createProgram(this.context, shaders);

    for (var i = 0; i < iteration; i++) {
        this.executeProgram(shaderProgram);
    }
};

GpuBackend.prototype.executeProgram = function (shaderProgram) {
    var gl = this.context,
        buffer = this.triangle;

    // swap the back and front buffer
    var tmp = this.frontTarget;
    this.frontTarget = this.backTarget;
    this.backTarget = tmp;

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

GpuBackend.prototype.read = function () {
    var gl = this.context;

    var data = new Uint8Array(this.viewportWidth * this.viewportHeight * 4);
    gl.readPixels(0, 0, this.viewportWidth, this.viewportHeight, gl.RGBA, gl.UNSIGNED_BYTE, data);

    var processedData = [];
    for(var i = 0; i < data.length; i += 4) {
        processedData.push(data[i] === 255 ? 1 : 0);
    }

    return processedData;
};

module.exports = GpuBackend;