PositionedGraph = function( drawGraph )
{
    this.DG = drawGraph;
};

PositionedGraph.prototype = {

    addChild: function( childhubId )
    {
        console.log("======= before ========");
        console.log("== GG:");
        console.log(stringifyObject(this.DG.GG));
        console.log("== Ranks:");
        console.log(stringifyObject(this.DG.ranks));
        console.log("== Orders:");
        console.log(stringifyObject(this.DG.order));
        console.log("== Positions:");
        console.log(stringifyObject(this.DG.positions));

        if (this.DG.GG.type[childhubId] != TYPE.CHILDHUB)
            throw "Assertion failed: adding children to a non-childhub node";

        var insertRank = this.DG.ranks[childhubId] + 1;

        // find the best order to use for this new vertex: scan all orders on the rank, check number of crossed edges
        var insertOrder = this.findBestInsertPosition( insertRank, childhubId, this.DG.G.defaultPersonNodeWidth );

        // insert the vertex
        var newNodeId = this.DG.G.insertVertex("_" + (this.DG.GG.getMaxRealVertexId()+1), TYPE.PERSON, {}, 1.0, [childhubId], []);

        if (insertRank > this.DG.maxRank)
            this.DG.maxRank = insertRank;
        this.DG.ranks[newNodeId] = insertRank;

        // re-create the processed graph, which will also re-create all virtual vertices and update their ranks
        this.DG.GG = this.DG.G.makeGWithSplitMultiRankEdges(this.DG.ranks, this.DG.maxRank);

        // update orders
        this.DG.order.insertAndShiftAllIdsAboveVByOne(newNodeId, insertRank, insertOrder);

        // update positions
        var desiredPosition = this.DG.positions[childhubId];
        this.updatePositionForNewNode( newNodeId, insertOrder, insertRank, desiredPosition );

        // update vertical levels
        this.DG.vertLevel = this.DG.positionVertically();

        // update ancestors
        var ancestors = this.DG.findAllAncestors();
        this.DG.ancestors = ancestors.ancestors;
        this.DG.consangr  = ancestors.consangr;

        console.log("======= after ========");
        console.log("== GG:");
        console.log(stringifyObject(this.DG.GG));
        console.log("== Ranks:");
        console.log(stringifyObject(this.DG.ranks));
        console.log("== Orders:");
        console.log(stringifyObject(this.DG.order));
        console.log("== Positions:");
        console.log(stringifyObject(this.DG.positions));
    },

    addParents: function( nodeId, relationshipId )  // if relationshipId is indefined 2 new nodes and a new relationship (between those nodes) will be created
    {
    },

    addRelationship: function( nodeId1, nodeId2 )   // if nodeId2 is undefined a new node will be created
    {
    },

    repositionAll: function ()
    {
    },

    //=============================================================

    findBestInsertPosition: function ( rank, edgeToV, insertWidth )
    {
        // find the order on rank 'rank' to insert a new vertex so that the edge connecting this new vertex
        // and vertex 'edgeToV' crosses the smallest number of edges. Ties are broken by using the
        // order which can be assigned closes "position" to the 'edgeToV' position as possible (assuming new vertex width insertWidth)

        //var desiredPosition = this.DG.positions[ edgeToV ];
        var edgeToRank      = this.DG.ranks[ edgeToV ];
        var edgeToOrder     = this.DG.order.vOrder[edgeToV];

        var bestInsertOrder  = 0;
        var bestCrossings    = Infinity;
        //var bestPositionDiff = 0;

        for (var o = 0; o <= this.DG.order.order[rank].length; o++) {
            var numCrossings = this.edgeCrossingsByFutureEdge( rank, o - 0.5, edgeToRank, edgeToOrder );

            //console.log("position: " + o + ", numCross: " + numCrossings);

            //var bestPositionHere = ...
            //var diffWithDesiredPos = Math.abs( bestPositionHere - desiredPosition );

            if ( numCrossings < bestCrossings ||                           // less crossings
                 (numCrossings == bestCrossings && o > bestInsertOrder )   // the later in the order the better: fewer vertices shifted
                 //(numCrossings == bestCrossings && diffWithDesiredPos < bestPositionDiff)  // try to position right below/above the node this one connects to
               ) {
               bestInsertOrder = o;
               bestCrossings   = numCrossings;
            }
        }

        return bestInsertOrder;
    },

    edgeCrossingsByFutureEdge: function ( fromRank, fromOrder, toRank, toOrder )
    {
        // counts how many existing edges a new edge from given rank&order to given rank&order would cross
        // if order is an integer, it is assumed it goes form an existing vertex
        // if order is inbetween two integers, it is assumed it is the position used for a new-to-be-inserted vertex

        // for simplicity (to know if we need to check outEdges or inEdges) get the edge in the correct direction
        // (i..e from lower ranks to higher ranks)
        var rankFrom  = Math.min( fromRank, toRank );
        var rankTo    = Math.max( fromRank, toRank );
        var orderFrom = (fromRank < toRank) ? fromOrder : toOrder;
        var orderTo   = (fromRank < toRank) ? toOrder : fromOrder;

        // Crossing occurs if either
        // 1) there is an edge going from rank[v]-ranked vertex with a smaller order
        //     than v to a rank[targetV]-ranked vertex with a larger order than targetV
        // 2) there is an edge going from rank[v]-ranked vertex with a larger order
        //     than v to a rank[targetV]-ranked vertex with a smaller order than targetV

        var crossings = 0;

        if (rankFrom == rankTo)
        {
            throw "TODO";
        }

        var verticesAtRankTo = this.DG.order.order[ rankTo ];

        for (var ord = 0; ord < verticesAtRankTo.length; ord++) {
            if ( ord == orderTo ) continue;

            var vertex = verticesAtRankTo[ord];

            var inEdges = this.DG.GG.getInEdges(vertex);
            var len     = inEdges.length;

            for (var j = 0; j < len; j++) {
                var target = inEdges[j];

                var orderTarget = this.DG.order.vOrder[target];
                var rankTarget  = this.DG.ranks[target];

                if (rankTarget == rankTo)
                {
                    if ( ord < orderTo && orderTarget > orderTo ||
                         ord > orderTo && orderTarget < orderTo )
                         crossings++;
                }
                else
                {
                    if (ord < orderTo && orderTarget > orderFrom ||
                        ord > orderTo && orderTarget < orderFrom )
                        crossings++;
                }
            }
        }

        return crossings;
    },

    updatePositionForNewNode: function ( newNodeId, insertOrder, insertRank, desiredPosition )
    {
        this.DG.positions.splice( newNodeId, 0, -1 );  // temporary -1 position: to bring this.DG.positions in sync with new node IDs

        var xcoord = new XCoord();
        xcoord.init(this.DG.positions, this.DG.horizontalPersonSeparationDist, this.DG.horizontalRelSeparationDist,
                    this.DG.GG.vWidth, this.DG.order, this.DG.ranks, this.DG.GG.type);

        var leftBoundary  = xcoord.getLeftMostNoDisturbPosition(newNodeId);
        var rightBoundary = xcoord.getRightMostNoDisturbPosition(newNodeId);

        if ( desiredPosition < leftBoundary )
            insertPosition = leftBoundary;
        else
        if ( desiredPosition > rightBoundary )
            insertPosition = Math.max(leftBoundary, rightBoundary);   // if we insert between two closedly packed nodes, leftBoundary will be greater than rightBoundary
        else
            insertPosition = desiredPosition;

        //console.log("Position: " + insertOrder + ", leftBoundary: " + leftBoundary + ", right: " + rightBoundary + ", desired: " + desiredPosition + ", actualInsert: " + insertPosition);

        //this.DG.positions.splice( newNodeId, 0, insertPosition );
        this.DG.positions[newNodeId] =insertPosition;

        // find out how far we should move all vertices to the right on the same rank
        if (insertPosition <= rightBoundary) {
            // nothing to shift - great, just insert thisnode with its position and we are done
            return;
        }

        shiftAmount = (insertPosition - rightBoundary);    // need to shift right neighbour by this much

        // common special case: we can shift just the right neighbour which has a relationship
        // without disturbing anything else: just do that
        // note: if (insertPosition <= rightBoundary) it means there is a right neighbour
        var rightNeighbour = this.DG.order.order[insertRank][insertOrder+1];
        var rightBoundary  = xcoord.getRightMostNoDisturbPosition(rightNeighbour);
        if ( this.DG.GG.type[rightNeighbour] == TYPE.PERSON && this.DG.GG.getOutEdges(rightNeighbour).length == 1 ) {
            if ( this.DG.positions[rightNeighbour] + shiftAmount < rightBoundary ) {
                this.DG.positions[rightNeighbour] += shiftAmount;
                return;
            }

            // even if we can't stop further shifts, decrease as much as possible
            var slack = rightBoundary - this.DG.positions[rightNeighbour];
            this.DG.positions[rightNeighbour] += slack;
            shiftAmount -= slack;
        }


        // From here on for simplicity we shift some vertices by the same amount 'shiftAmount', to
        // keep current graph layout as much as possible some disturbance will definitely occur, but
        // the following heuristic seems to work well to minimize it (without re-computing everything
        // from scratch, which may result in a totsally different layout which may be more confusing for the user)

        // Heuristic: only shift vertices to the right & on the same rank with new node,
        //            plus all connected (possibly through a path of length > 1) to these nodes and NOT
        //            connected (by any path [*]) to the vertices to the left of new node on the same rank.
        //            [*] any path is terminated when it reaches the rank of new node, i.e. nodes
        //                above the rank, at the rank and below the rank are treated independently.

        var doNotShiftAnchors = {};   // set of no-shift nodes. Set is used to make checking existance faster
        var needToShift       = [];   // array of nodes which need to be shifted

        for (var o = 0; o < this.DG.order.order[insertRank].length; o++) {
            if ( o < insertOrder )
                doNotShiftAnchors[this.DG.order.order[insertRank][o]] = true;
            else if ( o > insertOrder )
                needToShift.push(this.DG.order.order[insertRank][o]);
        }

        // go over all vertices, find if there is a path (not going through rank 'insertRank')
        // connecting the vertex to one of the doNotShift nodes. Iff there is none, shift the node.
        // (note: if this part is commented only nodes on the same rank with new node will be shifted)
        needToShift = needToShift.concat( this.findNodesToShift( insertRank, doNotShiftAnchors, insertPosition ));


        for (var i = 0; i < needToShift.length; i++)
            this.DG.positions[needToShift[i]] += shiftAmount;
    },

    findNodesToShift: function( splitRank, doNotShiftAnchors, insertPosition )
    {
        var toShift = [];

        for (var v = 0; v < this.DG.GG.v.length; v++) {
            if (this.DG.ranks[v] == splitRank) continue;

            if (!this.checkConnectivityToAnchors( v, splitRank, insertPosition, doNotShiftAnchors, {} ))
                toShift.push(v);
        }

        //console.log("DoNotSHift: " + stringifyObject(doNotShiftAnchors));

        // fix relationships with one partnert shifted and another not
        for (var v = 0; v < this.DG.GG.v.length; v++) {
            if (this.DG.GG.type[v] == TYPE.RELATIONSHIP && doNotShiftAnchors.hasOwnProperty(v)) {
                var parents = this.DG.GG.getInEdges(v);
                var shift1  = doNotShiftAnchors.hasOwnProperty(parents[0]);
                var shift2  = doNotShiftAnchors.hasOwnProperty(parents[1]);
                if ( (!shift1 ^ !shift2) ) {           // if one parent is shifted but not the other (and not both) - equivalent to logical XOR
                    delete(doNotShiftAnchors[v]);
                    toShift.push(v);
                }
            }
        }

        return toShift;
    },

    checkConnectivityToAnchors: function( vertex, splitRank, insertPosition, doNotShiftAnchors, checkedSet )
    {
        //console.log("splitRank: " + splitRank +  ", noShift: " + stringifyObject(doNotShiftAnchors) + ", checked: " + stringifyObject(checkedSet));

        // depth first search in both out-edge and in-edge directions

        checkedSet[vertex] = true;

        var allEdges = this.DG.GG.getAllEdgesWithWeights(vertex);

        for (var u in allEdges) {
            if (allEdges.hasOwnProperty(u)) {
                if ( this.DG.GG.type[u] == TYPE.RELATIONSHIP && this.DG.order.vOrder[vertex] > this.DG.order.vOrder[u] && this.DG.positions[vertex] >= insertPosition)
                    continue;
                if ( doNotShiftAnchors.hasOwnProperty(u) ) {
                    doNotShiftAnchors[vertex] = true;
                    return true;
                }
                if ( this.DG.ranks[u] == splitRank)   // connectivity is terminated by the split rank. Note: some on the split rank are anchors, so need to check anchors first above, then this
                    continue;
                if ( !checkedSet.hasOwnProperty(u) )
                    if ( this.checkConnectivityToAnchors( u, splitRank, insertPosition, doNotShiftAnchors, checkedSet ) ) {
                        doNotShiftAnchors[vertex] = true;  // for speed up: if this vertex is connected to anchors, any connected to it is also connected
                        return true;
                    }
            }
        }

        return false;
    }

};

