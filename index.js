var utils = require('./lib/utils'),
    parser = require('cellular-automata-rule-parser'),
    generateShaders = require('./lib/cellular-automata-glsl'),
    GpuBackend = require('./lib/cellular-automata-gpu-backend');

var moore = require('moore'),
    vonNeumann = require('von-neumann'),
    unconventionalNeighbours = require('unconventional-neighbours');

var neighbourhoodFunctions = {
    'moore': moore,
    'von-neumann': vonNeumann,
    'axis': unconventionalNeighbours.axis,
    'corner': unconventionalNeighbours.corner,
    'edge': unconventionalNeighbours.edge,
    'face': unconventionalNeighbours.face
};

/**
 * Sort the neighbourhood from left to right, top to bottom, ...
 * @param {Array} a First neighbour
 * @param {Array} b Second neighbour
 * @returns {number}
 */
var neighbourhoodSorter = function neighbourhoodSorter (a, b) {
    a = a.join(',');
    b = b.join(',');
    return a > b ? 1 : a < b ? -1 : 0;
};

var getNeighbourhood = function getNeighbourhood(neighbourhoodType, neighbourhoodRange, dimension) {
    neighbourhoodType = !!neighbourhoodFunctions[neighbourhoodType] ? neighbourhoodType : 'moore';
    neighbourhoodRange = neighbourhoodRange || 1;
    dimension = dimension || 2;

    var neighbourhood = neighbourhoodFunctions[neighbourhoodType](neighbourhoodRange, dimension);
    neighbourhood.sort(neighbourhoodSorter);

    return neighbourhood;
};

/**
 * CellularAutomataGpu constructor
 * @param {int[]} shape Shape of the grid
 * @param {int} [defaultValue=0] Default value of the cells
 * @constructor
 */
var CellularAutomataGpu = function CellularAutomataGpu (shape, defaultValue) {
    this.shape = shape;
    this.dimension = shape.length;

    defaultValue = defaultValue || 0;

    this.array = utils.createArray(shape, defaultValue);
    this.backend = new GpuBackend(this.shape);
    this.rules = [];
};

CellularAutomataGpu.prototype.shape = null;
CellularAutomataGpu.prototype.dimension = null;
CellularAutomataGpu.prototype.array = null;

CellularAutomataGpu.prototype.currentRule = null;
CellularAutomataGpu.prototype.rules = null;
CellularAutomataGpu.prototype.backend = null;

CellularAutomataGpu.prototype.outOfBoundValue = null;
CellularAutomataGpu.prototype.outOfBoundWrapping = false;

/**
 * Fill the grid with a given distribution
 * @param {Array[]} distribution The distribution to fill the grid with (ie: [[0,90], [1,10]] for 90% of 0 and 10% of 1). Null values are ignored.
 * @param {function} [rng=Math.random] A random number generation function, default to Math.random()
 * @returns {CellularAutomataGpu} CellularAutomataGpu instance for method chaining.
 */
CellularAutomataGpu.prototype.fillWithDistribution = function (distribution, rng) {
    var sum = 0,
        array = this.array.data,
        numberOfDistributions = distribution.length,
        selection,
        i,
        k;

    rng = rng || Math.random;

    for (i = 0; i < numberOfDistributions; i++) {
        sum += distribution[i][1];
    }

    for (k = 0; k < array.length; k++) {
        selection = rng() * sum;

        for (i = 0; i < numberOfDistributions; i++) {
            selection -= distribution[i][1];
            if (selection <= 0 && distribution[i][0] !== null) {
                array[k] = distribution[i][0];
                break;
            }
        }
    }

    return this;
};

/**
 * Define the value used for the cells out of the array's bounds
 * @param {int|string} [outOfBoundValue=0] Any integer value or the string "wrap" to enable out of bound wrapping.
 * @public
 * @returns {CellularAutomataGpu} CellularAutomataGpu instance for method chaining.
 */
CellularAutomataGpu.prototype.setOutOfBoundValue = function (outOfBoundValue) {
    if (outOfBoundValue === 'wrap') {
        this.outOfBoundWrapping = true;
        this.outOfBoundValue = 0;
    } else {
        this.outOfBoundWrapping = false;
        this.outOfBoundValue = outOfBoundValue | 0;
    }

    if (this.currentRule !== null) {
        this.currentRule = {
            rule: this.currentRule.rule,
            shaders: null,
            iteration: 0
        }
    }

    return this;
};

/**
 * Define the rule of the cellular automata and the neighbourhood to be used.
 * @param {string} rule A rule string in Life, Vote for life, LUKY or Extended format.
 * @public
 * @returns {CellularAutomataGpu} CellularAutomataGpu instance for method chaining.
 */
CellularAutomataGpu.prototype.setRule = function (rule) {
    var parsedRule = parser(rule);

    if (parsedRule === null) {
        throw new Error('The rulestring could not be parsed.');
    }

    this.currentRule = {
        rule: parsedRule,
        shaders: null,
        iteration: 0
    };

    return this;
};

/**
 * Apply the previously defined CA rule multiple times.
 * @param {int} [iterationNumber=1] Number of iterations
 * @public
 * @returns {CellularAutomataGpu} CellularAutomataGpu instance for method chaining.
 */
CellularAutomataGpu.prototype.iterate = function (iterationNumber) {
    iterationNumber = iterationNumber || 1;

    if (this.currentRule.iteration === 0) {
        var neighbourhood = getNeighbourhood(this.currentRule.rule.neighbourhoodType, this.currentRule.rule.neighbourhoodRange, this.dimension);
        this.currentRule.shaders = generateShaders(this.currentRule.rule, neighbourhood, this.shape, this.outOfBoundWrapping ? 'wrap' : this.outOfBoundValue);
        this.rules.push(this.currentRule);
    }

    this.currentRule.iteration += iterationNumber;

    return this;
};

/**
 * Apply a given rule for a given number of iterations, shortcut method for setRule and iterate
 * @param {string} rule A rule string in Life, Vote for life, LUKY or Extended format.
 * @param {int} [iteration=1] Number of iterations
 * @public
 * @returns {CellularAutomataGpu} CellularAutomataGpu instance for method chaining.
 */
CellularAutomataGpu.prototype.apply = function (rule, iteration) {
    return this.setRule(rule).iterate(iteration);
};

/**
 * Execute all the stored operation on the GPU
 * @public
 * @returns {CellularAutomataGpu} CellularAutomataGpu instance for method chaining.
 */
CellularAutomataGpu.prototype.finalize = function () {
    if (this.rules.length) {
        this.backend.write(this.array, this.shape);

        for (var i = 0; i < this.rules.length; i++) {
            this.backend.execute(this.rules[i]);
        }

        var data = this.backend.read();

        for (i = 0; i < data.length; i++) {
            var x = i % this.shape[0],
                y = Math.floor(i / this.shape[0]);

            this.array.set(x, y, data[i]);
        }

        this.rules = [];
    }

    return this;
};

var CellularAutomataCpu = require('cellular-automata');

var displayNDarray = function (array, shape) {
    var string = '\n',
        x, y, v;

    for (y = 0; y < shape[1]; y++) {
        for (x = 0; x < shape[0]; x++) {
            v = array.get(x,y);
            string+= v ? '0' + v.toString(10) : '..';
        }

        string+= '\n';
    }

    console.log(string);
};

module.exports = function() {
    function test(shape, rule, iterations) {
        console.log('----- Width ' + shape[0] + ' Height ' + shape[0] + ' Iterations ' + iterations + 'x Rule "' + rule + '" -----');



        var cagpu = new CellularAutomataGpu(shape, 0);

        var gputime = Date.now();
        cagpu.setOutOfBoundValue(1);
        cagpu.apply(rule, iterations);
        cagpu.finalize();

        gputime = Date.now() - gputime;

        console.log('GPU: ' + (gputime/1000).toPrecision(4) + 's');



        var cacpu = new CellularAutomataCpu(shape, 0);

        var cputime = Date.now();
        cacpu.setOutOfBoundValue(1);
        cacpu.apply(rule, iterations);

        cputime = Date.now() - cputime;

        console.log('CPU: ' + (cputime/1000).toPrecision(4) + 's');
    };

    setTimeout(function() {
        //test([100, 100], '23/3', 10);
        //test([100, 100], '23/3', 100);
        //test([100, 100], '23/3', 1000);

        //test([200, 200], '23/3', 10);
        //test([200, 200], '23/3', 100);
        //test([200, 200], '23/3', 1000);

        /*
        test([400, 400], '23/3', 10);
        test([400, 400], '23/3', 100);
        test([400, 400], '23/3', 1000);
        */

/*
        test([800, 800], '23/3', 10);
        test([800, 800], '23/3', 100);
        test([800, 800], '23/3', 1000);

        test([800, 800], '23/3 V', 10);
        test([800, 800], '23/3 V', 100);
        test([800, 800], '23/3 V', 1000);
        */

        var cagpu = new CellularAutomataGpu([48,30], 0);

        cagpu.setOutOfBoundValue(1);
        cagpu.apply('E 2,7,8/3,8', 15);
        cagpu.apply('LUKY 3323', 1);
        cagpu.apply('E 2,7,8/3,8', 3);
        cagpu.finalize();

        displayNDarray(cagpu.array, cagpu.shape);

        /*
        var gputime = Date.now();

        var cagpu = new CellularAutomataGpu([480, 300], 0);

        cagpu.setOutOfBoundValue(1);
        cagpu.apply('E2,7,8/3,8', 500);
        cagpu.finalize();

        gputime = Date.now() - gputime;

        //displayNDarray(cagpu.array, cagpu.shape);

        console.log('-----');


        var cputime = Date.now();

        var cacpu = new CellularAutomataCpu([480, 300], 0);

        cacpu.setOutOfBoundValue(1);
        cacpu.apply('E2,7,8/3,8', 500);

        cputime = Date.now() - cputime;

        //displayNDarray(cacpu.array, cacpu.shape);

        console.log('CPU: ' + cputime + 'ms\nGPU: ' + gputime + 'ms');
        */
    }, 10);

};
