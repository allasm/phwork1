function display_raw_graph(G, renderTo) {
    printObject(G);
    document.getElementById(renderTo).innerHTML =
        '<pre>'+
        'vertices:   ' + stringifyObject(G.nameToId)+'\n'+
        'edgesFromV: ' + stringifyObject(G.v)+'\n'+
        'weights:    ' + stringifyObject(G.weights) + '\n' +
        'widths:     ' + stringifyObject(G.vWidth) + '\n</pre>';
}


function display_processed_graph(renderPackage, renderTo, debugPrint, debugMsg) {

    //if (!debugPrint) printObject(renderPackage);

    var G         = renderPackage.convertedG;
    var ranks     = renderPackage.ranks;
    var ordering  = renderPackage.ordering;
    var positions = renderPackage.positions;
    var consangr  = renderPackage.consangr;

    var canvas = Raphael(renderTo, 3000, 1200);

    var xScale = 6.0;

    var curY = 10;

    if (debugMsg) canvas.text(50,10,debugMsg);

    // rank 0 has removed virtual nodes
    for ( var r = 1; r < ordering.order.length; r++ ) {

        var len = ordering.order[r].length;
        for ( var i = 0; i < len; i++ ) {
            var v = ordering.order[r][i];

            if (v > G.getMaxRealVertexId()) continue;

            var topY   = curY;
            var leftX  = positions[v] - G.getVertexHalfWidth(v);
            var rightX = positions[v] + G.getVertexHalfWidth(v);

            if ( v <= G.getMaxRealVertexId() ) {
                var box = canvas.rect( 5 + leftX * xScale, topY, G.getVertexWidth(v) * xScale, 30 );
                box.attr({fill: "#ccc"});
            }

            var midX = 5 + leftX * xScale + (G.getVertexWidth(v) * xScale)/2;

            if ( v <= G.getMaxRealVertexId() || debugPrint )
                //var text = canvas.text( midX, topY + 15, G.getVertexNameById(v) );
                var text = canvas.text( midX, topY + 15, v.toString() );

            var outEdges = G.getOutEdges(v);

            for ( var j = 0; j < outEdges.length; j++ ) {
                var u = outEdges[j];

                var leftTargetX  = positions[u] - G.getVertexHalfWidth(u);
                var rightTargetX = positions[u] + G.getVertexHalfWidth(u);
                var midTargetX  = 5 + leftTargetX * xScale + (G.getVertexWidth(u) * xScale)/2;

                var stroke = "#000";
                var destination = u;
                while (destination > G.getMaxRealVertexId())
                    destination = G.getOutEdges(destination)[0];
                if (consangr.hasOwnProperty(destination))
                    stroke = "#F00";

                if ( ranks[u] == ranks[v] )  // edge across
                {
                    // note: only possible with "relationship" nodes on the same rank
                    if ( ordering.vOrder[u] < ordering.vOrder[v] ) {   // edge to the left
                        var line = canvas.path("M " + (5+leftX*xScale) + " " + (topY + 10) + " L " + (5+rightTargetX*xScale) + " " + (topY + 15));
                        line.attr({"stroke":stroke});
                    }
                    else {                                             // edge to the right
                        var line = canvas.path("M " + (5+rightX*xScale) + " " + (topY + 10) + " L " + (5+leftTargetX*xScale) + " " + (topY + 15));
                        line.attr({"stroke":stroke});
                    }
                }
                else                         // edge below
                {
                    if (u <= G.getMaxRealVertexId()){
                        var startX = midX;
                        if (midTargetX < midX) { midTargetX += 2; startX -= 2; }
                        if (midTargetX > midX) { midTargetX -= 2; startX += 2; }
                        var line = canvas.path("M " + (startX) + " " + (topY+30) + " L " + (midTargetX) +
                                               " " + (topY + 50));
                        line.attr({"stroke":stroke});
                    }
                    else {
                        // the entire long edge is handled here so that it is easie rot replace by splines or something else later on
                        var yy      = topY + 30;
                        var targetY = topY + 50;
                        var prevX   = midX;

                        while (true) {
                            var leftTargetX = positions[u] - G.getVertexHalfWidth(u);
                            var midTargetX  = 5 + leftTargetX * xScale + (G.getVertexWidth(u) * xScale)/2;

                            if (u > G.getMaxRealVertexId()) {
                                var line = canvas.path("M " + (prevX) + " " + yy + " L " + (midTargetX) +
                                                       " " + targetY);
                                line.attr({"stroke":stroke});

                                if (G.getOutEdges(u)[0] > G.getMaxRealVertexId() ) {
                                    // draw a line across the node itself (instead of a box as for real nodes)
                                    var line2 = canvas.path("M " + (midTargetX) + " " + targetY + " L " + (midTargetX) +
                                                           " " + (targetY+30));
                                    line2.attr({"stroke":stroke});
                                }
                                else { yy -= 30; }
                            }
                            else {
                                var leftTargetX  = positions[u] - G.getVertexHalfWidth(u);
                                var rightTargetX = positions[u] + G.getVertexHalfWidth(u);
                                var midTargetX  = 5 + leftTargetX * xScale + (G.getVertexWidth(u) * xScale)/2;
                                // final piece - this one goes across to the right or to the left (since multi-rank edges only connect relationship nodes)
                                // note: only possible with "relationship" nodes on the same rank
                                if ( ordering.vOrder[u] < ordering.vOrder[v] ) {   // edge to the left
                                    var line = canvas.path("M " + prevX + " " + (yy) + " L " + (5+rightTargetX*xScale) + " " + (yy + 15));
                                    line.attr({"stroke":stroke});
                                }
                                else                                               // edge to the right
                                {
                                    var line = canvas.path("M " + prevX + " " + (yy) + " L " + (5+leftTargetX*xScale) + " " + (yy + 15));
                                    line.attr({"stroke":stroke});
                                }
                                break;
                            }

                            v = u;
                            u = G.getOutEdges(u)[0];

                            yy      += 50;
                            targetY += 50;

                            prevX = midTargetX;
                        }
                    }
                }
            }
        }

        curY += 50;
    }
}

//-----------------------------------------------

function stringifyObject(obj) {
    return _printObjectInternal(obj, 1);
}

function printObject(obj) {
    console.log( _printObjectInternal(obj, 0) );
}

function _printObjectInternal(o, level) {
    var output = '';

    if (typeof o == 'object')
    {

        if (Object.prototype.toString.call(o) === '[object Array]' ||
            o instanceof Uint32Array)
        {
            output = '[';
            for (var i = 0; i < o.length; i++) {
                if (i > 0) output += ', ';
                output += _printObjectInternal(o[i], level+1);
            }
            output += ']';
        }
        else
        {
            output = '{';
            var idx = 0;
            if (level == 0) output += '\n';
            for (property in o) {
                if (!o.hasOwnProperty(property)) continue;

                if (level != 0 && idx != 0 )
                    output += ', ';
                output += property + ': ' + _printObjectInternal(o[property], level+1);

                if (level == 0)
                    output += '\n';
                idx++;
            }
            output += '}';
        }
    }
    else
        output = ''+o;

    return output;
}

