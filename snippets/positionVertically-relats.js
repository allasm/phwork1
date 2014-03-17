        // 2) vertical positioning of person-relationship edges:
        for (var r = 1; r <= this.maxRank; r++) {

            var initLevels = [];
            var minLevels  = [];
            var edgeInfo   = [];

            var len = this.order.order[r].length;
            for (var i = 0; i < len; i++) {
                var v = this.order.order[r][i];

                if (this.GG.isPerson(v)) {
                    var outEdges = this.GG.getOutEdges(v);
                    if (outEdges.length <= 0) continue;

                    var v_x = this.positions[v];

                    verticalLevels.outEdgeVerticalLevel[v] = {};

                    for (var j = 0; j < outEdges.length; j++) {
                        var u = outEdges[j];

                        var finalTarget = this.GG.downTheChainUntilNonVirtual(u);

                        var left_x    = Math.min( v_x, this.positions[u] );
                        var right_x   = Math.max( v_x, this.positions[u] );
                        var down_x    = this.positions[u];
                        var top_x     = Infinity;
                        var min_level = 1;

                        // if the edge is going upwards need to take that into account when positioning edges
                        // on this rank, not on the rank of the other parent
                        if (u == finalTarget) {                      // same as !this.GG.isVirtual(u)
                            var parents = this.GG.getInEdges(u);

                            var otherParent = (parents[0] == v) ? parents[1] : parents[0];

                            if (this.GG.isVirtual(otherParent)) {       // can only be if the edge goes upwards since relationship nodes
                                top_x = this.positions[otherParent];    //  are always ranked at the rank of the lower-ranked partner
                            }

                            var uOrder = this.order.vOrder[u];
                            if (uOrder != i-1 && uOrder != i+1)
                                min_level = 2;
                        }

                        edgeInfo.push( { "v": v, "rel": finalTarget, "v_x": v_x, "left_x": left_x, "right_x": right_x, "down_x": down_x, "top_x": top_x, "min_level": min_level} );
                        initLevels.push(1);
                        minLevels.push(min_level);
                    }

                    //console.log("Vert levels @ rank " + r + ": " + verticalLevels.rankVerticalLevels[r-1]);
                }
            }

            if (edgeInfo.length == 0)
                continue;

            // compose the "crossing score" function which, given edgeInfo + which horizontal line is higher,
            // can tell the number of crossings between two node-to-relationship edges
            var pairScoreFunc = function( edge1, edge2, edge1level, edge2level ) {
                //
                // general form of a displayed edges is one of:
                // (where the solid line is part of the edge and the dotted part is treated as a separate edge related to the other partner or some other node)
                //
                // a)             ___________                           .....                   <-- level 2   \
                //            ___/           \                         .     .                                 }  <--- between rank R and R-1
                //     [node1]......[other]   \_____[relationship]..../       \....[node2]      <-- level 1   /
                //                    .                   |
                //                    .                   |
                //       ^                                ^
                //     left_x & v_x               right_x & down_x      (no top_x)
                //
                // b)                                                    ........[node2]                          <--- on some other rank
                //                _________                              |
                //               /         \                             |
                //     [node1]__/   [...]   \_____[relationship]_____[virtual]        <--- this virtual node is the "otherParent" of relationship
                //                                      |
                //                                      |
                //       ^                              ^                ^
                //     left_x & v_x                  down_x       right_x & top_x
                //
                // c)            _________
                //              /         \
                //     [node]__/   [...]   \__[virtual]
                //                               |
                //                               |
                //                               .......[relationship].....[node2]                                <--- on some other rank
                //       ^                       ^
                //     left_x & v_x      right_x & down_x     (no top_x)

                if ( edgeInfo[edge1].right_x <= edgeInfo[edge2].left_x ||
                     edgeInfo[edge1].left_x  >= edgeInfo[edge2].right_x )
                     return 0;                                              // edges do not overlap => no penalty for any level assignment

                if (edge1level == edge2level) return Infinity;              // intersect and at the same level => forbidden => (penalty == Infinity)

                if (edge1level > edge2level) {
                    var tmpEdge  = edge1;
                    var tmpLevel = edge1level;
                    edge1        = edge2;
                    edge1level   = edge2level;
                    edge2        = tmpEdge;
                    edge2level   = tmpLevel;
                }

                // edge1 completely overlaps edge2 and is above - this is optimal, penalty = 0
                if (edgeInfo[edge1].left_x <= edgeInfo[edge2].left_x && edgeInfo[edge1].right_x >= edgeInfo[edge2].right_x)
                    return 0;
                // should overlap but instead is below - 2 unnecessary intersections
                if (edgeInfo[edge1].left_x > edgeInfo[edge2].left_x && edgeInfo[edge1].right_x < edgeInfo[edge2].right_x)
                    return 2;

                var extraIntersections = 0;

                // edges cross: if lower edge has top_x and it crosses the other edge -> report 1 unnecessary crossing
                if (edgeInfo[edge2].top_x >= edgeInfo[edge1].left_x && edgeInfo[edge2].top_x <= edgeInfo[edge1].right_x)
                    extraIntersections++;

                // edges cross: upper edge's down_x crosses lower edge
                if (edgeInfo[edge1].down_x >= edgeInfo[edge2].left_x && edgeInfo[edge1].down_x <= edgeInfo[edge2].right_x)
                    extraIntersections++;

                return extraIntersections;
            }

            var optimizer = new VerticalPosIntOptimizer( pairScoreFunc, initLevels, minLevels );

            var relEdgeLevels = optimizer.computeVerticalPositions( 5, 400 );

            console.log("[rank " + r + "] Final vertical relationship edge levels: " +  stringifyObject(relEdgeLevels));

            var relEdgeLevels = 1;
            var currentNode   = null;      // all edges related to a node are grouped together in the edgeInfo array (by construction)
            var leftEdges     = [];
            var rightEdges    = [];
            for (var v = 0; v < edgeInfo.length; v++) {
                var edge = edgeInfo[v];
                var node = edge.v;

                if (node != currentNode) {
                    // finalize currentNode: sort left and rigth edges by level and assign the corresponding attachlevel
                    // verticalLevels.outEdgeVerticalLevel[v][u] = { attachlevel: nextAttachR, verticalLevel: nextVerticalR };
                    //...

                    currentNode = node;
                    leftEdges   = [];
                    rightEdges  = [];
                }

                edge.level = relEdgeLevels[v];

                if (edge.v_x == edge.left_x)
                    rightEdges.push(edge);
                else
                    leftEdges.push(edge);

                if (relEdgeLevels[v] > relEdgeLevels)
                    relEdgeLevels = relEdgeLevels[v];
            }

            verticalLevels.rankVerticalLevels[r-1] += (relEdgeLevels - 1);
        }
        console.log("Vertical positioning: " + stringifyObject(verticalLevels.outEdgeVerticalLevel));

