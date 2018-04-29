"use strict";

var inside = require("robust-point-in-polygon");
var inside = require("robust-point-in-polygon");

require("tape")(function(t) {

    var polygonRect = [ [ 1, 1 ], [ 1, 2 ], [ 2, 2 ], [ 2, 1 ] ];
    var polygonTriangle = [ [ 1.5, 2 ], [ 2, 1 ], [ 1, 1 ] ];
    var polygonCustom = [ [ 1, 1 ], [ 1, 2 ], [ 1.5, 1.5 ], [ 2, 2 ], [ 2, 1 ] ];

    t.equals(inside(polygonRect, [ 1.5, 1.5 ]), -1);
    t.equals(inside(polygonRect, [ 1.2, 1.9 ]), -1);
    t.equals(inside(polygonTriangle, [ 0, 1.9 ]), 1);
    t.equals(inside(polygonTriangle, [ 1.5, 1 ]), 0);
    t.equals(inside(polygonCustom, [ 1.5, 2.2 ]), 1);
    t.equals(inside(polygonCustom, [ 3, 5 ]), 1);
    t.equals(inside(polygonCustom, [ 1, 1.5 ]), 0);
    t.equals(inside(polygonCustom, [ 1.5, 1.5 ]), -1);

    t.end();
});