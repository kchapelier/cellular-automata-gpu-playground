"use strict";

var isNode = !!(typeof process !== 'undefined' && process.versions && process.versions.node),
    isWeb = !!(typeof window === 'object' && typeof document === 'object'),
    isWorker = !!(typeof WorkerGlobalScope !== 'undefined' && typeof self === 'object' && self instanceof WorkerGlobalScope),
    hasOffscreenCanvas = !!(typeof OffscreenCanvas === 'function');

var getHeadlessGlContext = function getHeadlessGlContext (glOptions) {
    var context;

    try {
        context = require('gl')(64, 64, glOptions);
    } catch (e) {
        throw new Error('Could not initialize WebGL context : ' + e.message);
    }

    return {
        canvas: null,
        gl: context,
        resize: function (width, height) {
            this.gl.resize(width, height);
        }
    };
};

var getWebGlContext = function getWebGlContext (glOptions) {
    var canvas,
        context;

    try {
        if (isWeb) {
            canvas = document.createElement('canvas');
        } else if(hasOffscreenCanvas) {
            canvas = new OffscreenCanvas(64, 64);
        }

        context = canvas.getContext('webgl2', glOptions) || canvas.getContext('webgl', glOptions) || canvas.getContext('experimental-webgl', glOptions);
    } catch (e) {
        throw new Error('Could not initialize WebGL context : ' + e.message);
    }

    if (!context) {
        throw new Error('Could not initialize WebGL context');
    }

    return {
        canvas: canvas,
        gl: context,
        resize: function (width, height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
    };
};

/**
 * Retrieve an OpenGL context
 * @param {object} glOptions
 * @returns {{canvas:*,context:*,resize:Function}} Context
 */
var getContext = function getContext (glOptions) {
    if (isNode) {
        return getHeadlessGlContext(glOptions);
    } else if(isWeb || isWorker) {
        return getWebGlContext(glOptions);
    }
};

module.exports = getContext;
