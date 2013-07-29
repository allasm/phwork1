function display_raw_graph(G, renderTo) {
    printObject(G);
    document.getElementById(renderTo).innerHTML =
        '<pre>'+
        'vertices:   ' + stringifyObject(G.nameToId)+'\n'+
        'edgesFromV: ' + stringifyObject(G.v)+'\n'+
        'weights:    ' + stringifyObject(G.weights) + '\n</pre>';
}


function drawPersonBox ( canvas, scale, x, scaledY, width, label, sex ) {
    // x: middle of node
    // y: top of node

    var cornerRadius = 0;
    if (sex == "f")
        cornerRadius = scale.yscale * scale.yLevelSize/2;
    var fill = "#ccc";
    if (sex == "u")
        fill = "#ddd";

    var box = canvas.rect( scale.xshift + (x - width/2)*scale.xscale, scaledY, width*scale.xscale, scale.yLevelSize * scale.yscale, cornerRadius );
    box.attr({fill: fill});

    var text = canvas.text( scale.xshift + x*scale.xscale, scaledY + (scale.yLevelSize/2)*scale.yscale, label );
    //var text = canvas.text( scale.xshift + x*scale.xscale, scaledY + (scale.yLevelSize/2)*scale.yscale, x.toString() );
}

function computeChildhubHorizontalY ( scale, scaledY, targetLevel ) {
    return scaledY + (scale.yLevelSize + scale.yInterLevelGap)*scale.yscale + (targetLevel-1) * scale.yExtraPerHorizontalLevel;
}

function drawRelationshipChildhubEdge( canvas, scale, x, scaledY, targetLevel ) {
    var xx1 = scale.xshift + x*scale.xscale;
    var yy1 = scaledY + (scale.yLevelSize/2)*scale.yscale;
    var xx2 = xx1;
    var yy2 = computeChildhubHorizontalY( scale, yy1, targetLevel);
    var line = canvas.path("M " + xx1 + " " + yy1 + " L " + xx2 + " " + yy2);
    line.attr({"stroke":"#000"});
}

function drawVerticalChildLine( canvas, scale, childX, scaledY, targetLevel, scaledChildY) {
    var yy1 = scaledY + (scale.yLevelSize/2)*scale.yscale;
    var yy1 = computeChildhubHorizontalY( scale, yy1, targetLevel);
    var yy2 = scaledChildY;
    var xx1 = scale.xshift + childX*scale.xscale;
    var xx2 = xx1;
    var line = canvas.path("M " + xx1 + " " + yy1 + " L " + xx2 + " " + yy2);
    line.attr({"stroke":"#000"});
}

function drawHorizontalChildLine( canvas, scale, leftmostX, rightmostX, scaledY, targetLevel) {
    var xx1 = scale.xshift + leftmostX*scale.xscale;
    var xx2 = scale.xshift + rightmostX*scale.xscale;
    var yy1 = (scale.yLevelSize/2)*scale.yscale + computeChildhubHorizontalY( scale, scaledY, targetLevel);
    var yy2 = yy1;
    var line = canvas.path("M " + xx1 + " " + yy1 + " L " + xx2 + " " + yy2);
    line.attr({"stroke":"#000"});
}

function drawNeighbourRelationshipEdge( canvas, scale, x, scaledY, width, u_x, isBetweenRelatives ) {
    var stroke = "#000";
    if (isBetweenRelatives)
        stroke = "#F00";

    var yy1 = scaledY + (scale.yLevelSize/2)*scale.yscale;
    var yy2 = yy1;
    var xx1 = undefined;
    var xx2 = scale.xshift + u_x * scale.xscale;

    if ( u_x > x )
        xx1 = scale.xshift + (x + width/2)*scale.xscale;
    else
        xx1 = scale.xshift + (x - width/2)*scale.xscale;

    var line = canvas.path("M " + xx1 + " " + yy1 + " L " + xx2 + " " + yy2);
    line.attr({"stroke":stroke});
}

function display_processed_graph(renderPackage, renderTo, debugPrint, debugMsg) {

    //if (!debugPrint) printObject(renderPackage);

    var G         = renderPackage.convertedG;
    var ranks     = renderPackage.ranks;
    var ordering  = renderPackage.ordering;
    var positions = renderPackage.positions;
    var consangr  = renderPackage.consangr;
    var vertLevel = renderPackage.vertLevel;

    var canvas = Raphael(renderTo, 3000, 1200);

    var scale = { xscale: 4.0, yscale: 1.0, xshift: 5, yshift: 5, yLevelSize: 30, yInterLevelGap: 6, yExtraPerHorizontalLevel: 8 };

    if (debugMsg) canvas.text(50,10,debugMsg);

    // precompute Y coordinate for different ranks (so that it is readily available when drawing multi-rank edges)
    var rankYcoord = [0, scale.yshift];
    for ( var r = 2; r < ordering.order.length; r++ ) {
        // note: scale.yExtraPerHorizontalLevel*(vertLevel.rankVerticalLevels[r] - 1) part comes from the idea that if there are many horizontal lines between two ranks
        //       we want to separate those ranks vertically more than we separate other ranks
        rankYcoord[r] = rankYcoord[r-1] + (scale.yInterLevelGap + scale.yLevelSize + scale.yExtraPerHorizontalLevel*(vertLevel.rankVerticalLevels[r-1] - 1)) * scale.yscale;
    }

    // rank 0 has removed virtual nodes
    for ( var r = 1; r < ordering.order.length; r++ ) {

        var len = ordering.order[r].length;
        for ( var orderV = 0; orderV < len; orderV++ ) {
            var v = ordering.order[r][orderV];

            if (v > G.getMaxRealVertexId() || G.isChildhub(v)) continue;

            var width = G.getVertexWidth(v);
            var x     = positions[v];            // note: position has middle coordinates
            var y     = rankYcoord[r];

            if ( G.isRelationship(v) ) {
                var targetChildhub = G.getOutEdges(v)[0];
                // only one outedge to childhub - and it is guaranteed to be a one-rank long vertical edge
                drawRelationshipChildhubEdge( canvas, scale, x, y, vertLevel.childEdgeLevel[targetChildhub] );

                // draw child edges from childhub
                var childEdges = G.getOutEdges(targetChildhub);

                var leftmostX  = x;
                var rightmostX = x;
                for ( var j = 0; j < childEdges.length; j++ ) {
                    var child  = childEdges[j];
                    var childX =  positions[child];
                    if (childX > rightmostX)
                        rightmostX = childX;
                    if (childX < leftmostX)
                        leftmostX = childX;

                    drawVerticalChildLine( canvas, scale, childX, y, vertLevel.childEdgeLevel[targetChildhub], rankYcoord[r+2] );
                }

                drawHorizontalChildLine( canvas, scale, leftmostX, rightmostX, y, vertLevel.childEdgeLevel[targetChildhub]);
                continue;
            }

            if ( G.isPerson(v) ) {
                var outEdges = G.getOutEdges(v);
                for ( var j = 0; j < outEdges.length; j++ ) {
                    var u      = outEdges[j];
                    var orderU = ordering.vOrder[u];
                    var rankU  = ranks[u];

                    var u_x = positions[u];            // note: position has middle coordinates

                    var consangrRelationship = false;
                    var destination = u;
                    while (destination > G.getMaxRealVertexId())
                        destination = G.getOutEdges(destination)[0];
                    if (consangr.hasOwnProperty(destination))
                        consangrRelationship = true;

                    if ( rankU == r ) {
                        if (orderU == orderV+1 || orderU == orderV-1) {
                            // draw relationship edge directly
                            drawNeighbourRelationshipEdge( canvas, scale, x, y, width, u_x, consangrRelationship );
                        }
                        else
                        {
                            // draw "long" horizontal relationship edge (which goes above some other nodes)
                            // TODO

                        }
                    }
                    else {
                        // draw "long" (multi-rank) vetrtical relationship edge
                        // TODO
                        // note: always have a small horizontal part before connecting to middle of relationship node
                    }
                }

                drawPersonBox( canvas, scale, x, y, width, G.getVertexNameById(v), G.properties[v]["sex"]);
                continue;
            }

                    /*
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
                                    var line = canvas.path("M " + prevX + " " + (yy) + " L " + midTargetX + " " + (yy + 15));
                                    line.attr({"stroke":stroke});
                                }
                                else                                               // edge to the right
                                {
                                    var line = canvas.path("M " + prevX + " " + (yy) + " L " + midTargetX + " " + (yy + 15));
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
            }*/
        }
    }
}


// old version which does not make any assumptions about the structure (e.g. what is on what
// rank, that relationship nodes ar eon the same rank with person nodes, etc) and thus
// is good for debugging when certain parts of the algorithm are disabled
function debug_display_processed_graph(renderPackage, renderTo, debugPrint, debugMsg) {

    //if (!debugPrint) printObject(renderPackage);

    var G         = renderPackage.convertedG;
    var ranks     = renderPackage.ranks;
    var ordering  = renderPackage.ordering;
    var positions = renderPackage.positions;
    var consangr  = renderPackage.consangr;

    var canvas = Raphael(renderTo, 3000, 1200);

    var xScale = 4.0;

    var curY = 20;

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
            {
                //var text = canvas.text( midX, topY + 15, G.getVertexNameById(v) );
                var text = canvas.text( midX, topY + 15, v.toString() + "/" + positions[v].toString() );
                //var text = canvas.text( midX, topY + 15, midX.toString() );
            }

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
                        var line = canvas.path("M " + (5+leftX*xScale) + " " + (topY + 15) + " L " + (5+rightTargetX*xScale) + " " + (topY + 15));
                        line.attr({"stroke":stroke});
                    }
                    else {                                             // edge to the right
                        var line = canvas.path("M " + (5+rightX*xScale) + " " + (topY + 15) + " L " + (5+leftTargetX*xScale) + " " + (topY + 15));
                        line.attr({"stroke":stroke});
                    }
                }
                else                         // edge below
                {
                    if (u <= G.getMaxRealVertexId()){
                        var startX = midX;
                        if (midTargetX < midX) { midTargetX += 2; startX -= 2; }
                        if (midTargetX > midX) { midTargetX -= 2; startX += 2; }
                        var initLineY = topY+30;
                        var line = canvas.path("M " + (startX) + " " + initLineY + " L " + (midTargetX) +
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

                            if (u > G.getMaxRealVertexId() || ranks[u] != ranks[v]) {
                                var line = canvas.path("M " + (prevX) + " " + yy + " L " + (midTargetX) +
                                                       " " + targetY);
                                line.attr({"stroke":stroke});

                                if (u > G.getMaxRealVertexId() && G.getOutEdges(u)[0] > G.getMaxRealVertexId() ) {
                                    // draw a line across the node itself (instead of a box as for real nodes)
                                    var line2 = canvas.path("M " + (midTargetX) + " " + targetY + " L " + (midTargetX) +
                                                           " " + (targetY+30));
                                    line2.attr({"stroke":stroke});
                                }
                                else { yy -= 30; }

                                if (u <= G.getMaxRealVertexId()) break;
                            }
                            else {
                                var leftTargetX  = positions[u] - G.getVertexHalfWidth(u);
                                var rightTargetX = positions[u] + G.getVertexHalfWidth(u);
                                var midTargetX  = 5 + leftTargetX * xScale + (G.getVertexWidth(u) * xScale)/2;
                                // final piece - this one goes across to the right or to the left (since multi-rank edges only connect relationship nodes)
                                // note: only possible with "relationship" nodes on the same rank
                                if ( ordering.vOrder[u] < ordering.vOrder[v] ) {   // edge to the left
                                    var line = canvas.path("M " + prevX + " " + (yy) + " L " + midTargetX + " " + (yy + 15));
                                    line.attr({"stroke":stroke});
                                }
                                else                                               // edge to the right
                                {
                                    var line = canvas.path("M " + prevX + " " + (yy) + " L " + midTargetX + " " + (yy + 15));
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

