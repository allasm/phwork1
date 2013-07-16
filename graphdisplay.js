function display_raw_graph(G, renderTo) {
    printObject(G);
    Ext.fly(renderTo).update( '<pre>'+
                              'vertices:   ' + stringifyObject(G.nameToId)+'\n'+
                              'edgesFromV: ' + stringifyObject(G.v)+'\n'+
                              'weights:    ' + stringifyObject(G.weights) + '\n' +
                              'widths:     ' + stringifyObject(G.vWidth) + '\n</pre>' );
}


function display_processed_graph(renderPackage, renderTo, debugPrint, debugMsg) {

    if (!debugPrint) printObject(renderPackage);

    var G         = renderPackage.convertedG;
    var ranks     = renderPackage.ranks;
    var ordering  = renderPackage.ordering;
    var positions = renderPackage.positions;

    var canvas = Raphael(renderTo, 3000, 1500);

    var xScale = 6.0;

    var curY = 10;

    if (debugMsg) canvas.text(50,10,debugMsg);

    for ( var r = 0; r < ordering.order.length; r++ ) {

        if ( G.root == r ) continue;       // ignore the virtual root

        var len = ordering.order[r].length;
        for ( var i = 0; i < len; i++ ) {
            var v = ordering.order[r][i];

            var topY   = curY;
            var leftX  = positions[v] - G.getVertexHalfWidth(v);
            var rightX = positions[v] + G.getVertexHalfWidth(v);

            if ( v <= G.getMaxRealVertexId() ) {
                var box = canvas.rect( 5 + leftX * xScale, topY, G.getVertexWidth(v) * xScale, 30 );
                box.attr({fill: "#ccc"});
            }
            else {
                //var box = canvas.rect( 5 + leftX * xScale, topY, G.getVertexWidth(v) * xScale, 30 );
                //box.attr({fill: "#eee", "stroke": "#ddd"});
            }

            if (v > G.getMaxRealVertexId()) continue;

            var midX = 5 + leftX * xScale + (G.getVertexWidth(v) * xScale)/2;

            if ( v <= G.getMaxRealVertexId() || debugPrint )
                var text = canvas.text( midX, topY + 15, G.getVertexNameById(v) );

            var outEdges = G.getOutEdges(v);

            for ( var j = 0; j < outEdges.length; j++ ) {
                var u = outEdges[j];

                if ( u == v ) {
                    var p = [];
                    p.push(midX+50, curY + 15);
                    p.push(midX+30, curY + 5);
                    p = ["M", midX+30, curY + 25, "R"].concat(p);
                    var nextE = canvas.path(p);
                    nextE.attr({"stroke":"#955"});
                    continue;
                }

                var leftTargetX  = positions[u] - G.getVertexHalfWidth(u);
                var rightTargetX = positions[u] + G.getVertexHalfWidth(u);
                var midTargetX  = 5 + leftTargetX * xScale + (G.getVertexWidth(u) * xScale)/2;
                
                if ( ranks[u] < ranks[v] )        // edge above
                {
                   var line = canvas.path("M " + (midX+10) + " " + (topY+5) + " L " + (midTargetX+10) +
                                          " " + (curY - 20));
                   line.attr({"stroke":"#955"});
                }
                else if ( ranks[u] == ranks[v] )  // edge across
                {
                    // note: only possible with "relationship" nodes on the same rank
                    if ( ordering.vOrder[u] < ordering.vOrder[v] ) {   // edge to the left
                        var line = canvas.path("M " + (5+leftX*xScale) + " " + (topY + 10) + " L " + (5+rightTargetX*xScale) + " " + (topY + 15));
                        line.attr({"stroke":"#000"});                    
                    }
                    else                                               // edge to the right
                    {
                        var line = canvas.path("M " + (5+rightX*xScale) + " " + (topY + 10) + " L " + (5+leftTargetX*xScale) + " " + (topY + 15));
                        line.attr({"stroke":"#000"});                                        
                    }
                }
                else                              // edge below
                {
                    if (u <= G.getMaxRealVertexId()){
                        var startX = midX;
                        if (midTargetX < midX) { midTargetX += 2; startX -= 2; }
                        if (midTargetX > midX) { midTargetX -= 2; startX += 2; }
                        var line = canvas.path("M " + (startX) + " " + (topY+30) + " L " + (midTargetX) +
                                               " " + (topY + 50));
                        line.attr({"stroke":"#000"});
                    }
                    else {
                        var yy      = topY + 30;
                        var targetY = topY + 50;
                        var prevX   = midX;

                        while (true) {
                            var leftTargetX = positions[u] - G.getVertexHalfWidth(u);
                            var midTargetX  = 5 + leftTargetX * xScale + (G.getVertexWidth(u) * xScale)/2;

                            var line = canvas.path("M " + (prevX) + " " + yy + " L " + (midTargetX) +
                                                   " " + targetY);
                            line.attr({"stroke":"#000"});

                            if (u > G.getMaxRealVertexId()) {
                                var line = canvas.path("M " + (midTargetX) + " " + targetY + " L " + (midTargetX) +
                                                       " " + (targetY+30));
                                line.attr({"stroke":"#000"});
                            }

                            if (u <= G.getMaxRealVertexId()) break;
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
