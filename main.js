var CellularAutomataGpu = require('./'),
    CellularAutomataCpu = require('cellular-automata');

var displayNDarray = function (array, shape) {
    var string = '\n',
        x, y, z, v;

    if (shape.length == 2) {
        for (y = 0; y < shape[1]; y++) {
            for (x = 0; x < shape[0]; x++) {
                v = array.get(x,y);
                string+= v ? (v < 10 ? '0' + v.toString(10) : v.toString(10)) : '..';
            }

            string+= '\n';
        }
    } else {
        for (z = 0; z < shape[2]; z++) {
            if (z) {
                string += ' ---- \n';
            }

            for (y = 0; y < shape[1]; y++) {
                for (x = 0; x < shape[0]; x++) {
                    v = array.get(x, y, z);
                    string += v ? (v < 10 ? '0' + v.toString(10) : v.toString(10)) : '..';
                }

                string += '\n';
            }


        }
    }


    console.log(string);
    return string;
};

function test(shape, rule, iterations) {
    console.log('----- Width ' + shape[0] + ' Height ' + shape[1] + ' Depth ' + shape[2] + ' Iterations ' + iterations + 'x Rule "' + rule + '" -----');



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
}

/*
test([25, 25, 25], 'E 2..8 / 7..12', 10);
test([25, 25, 25], 'E 2..8 / 7..12', 50);
test([25, 25, 25], 'E 2..8 / 7..12', 250);

test([50, 50, 50], 'E 2..8 / 7..12', 10);
test([50, 50, 50], 'E 2..8 / 7..12', 50);
test([50, 50, 50], 'E 2..8 / 7..12', 250);

test([100, 100, 100], 'E 2..8 / 7..12', 10);
test([100, 100, 100], 'E 2..8 / 7..12', 50);
test([100, 100, 100], 'E 2..8 / 7..12', 250);
*/


//test([100, 100], '23/3', 10);
//test([100, 100], '23/3', 100);
//test([100, 100], '23/3', 1000);

//test([200, 200], '23/3', 10);
//test([200, 200], '23/3', 100);
//test([200, 200], '23/3', 1000);

//test([400, 400], '23/3', 10);
//test([400, 400], '23/3', 100);
//test([400, 400], '23/3', 1000);

/*
var cagpu = new CellularAutomataGpu([48,30], 0);

var gputime = Date.now();
cagpu.setOutOfBoundValue(1);
cagpu.apply('01368/01427', 20);
cagpu.apply('012368/0127', 20);
cagpu.finalize();
gputime = Date.now() - gputime;
console.log('--GPU: ' + (gputime/1000).toPrecision(3) + 's');

displayNDarray(cagpu.array, cagpu.shape);
*/

/*
var cagpu = new CellularAutomataGpu([3,3], 0);
cagpu.array.set(0, 0, 1);

displayNDarray(cagpu.array, cagpu.shape);

cagpu.apply('E / 0..26', 1);
cagpu.finalize();

displayNDarray(cagpu.array, cagpu.shape);
*/

/*
var cagpu = new CellularAutomataGpu([3,3,3], 0);
cagpu.array.set(1, 1, 0, 1);
cagpu.array.set(1, 1, 2, 1);
cagpu.array.set(1, 1, 1, 1);
cagpu.array.set(1, 0, 1, 1);
cagpu.array.set(1, 2, 1, 1);
cagpu.array.set(0, 1, 1, 1);
cagpu.array.set(2, 1, 1, 1);

cagpu.apply('E 0..26 / von-neumann', 5);
cagpu.finalize();

displayNDarray(cagpu.array, cagpu.shape);
*/

var strCpu,
    strGpu;

var shape = [100,50,3],
    rule = 'E  / 1..6 von-neumann',
    iterations = 3,
    outOfBoundValue = 0;

var cagpu = new CellularAutomataCpu(shape, 0);
cagpu.array.set(90, 40, 1, 1);

cagpu.setOutOfBoundValue(outOfBoundValue);
cagpu.apply(rule, iterations);

strCpu = displayNDarray(cagpu.array, cagpu.shape);

var cagpu = new CellularAutomataGpu(shape, 0);
cagpu.array.set(90, 44, 1, 1);

cagpu.setOutOfBoundValue(outOfBoundValue);
cagpu.apply(rule, iterations);
//cagpu.apply('debug');
cagpu.finalize();

strGpu = displayNDarray(cagpu.array, cagpu.shape);

//console.log(strCpu === strGpu);

module.exports = function() {};
