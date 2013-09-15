function isInt(n) {
    //return +n === n && !(n % 1);
    return !(n % 1);
}

PositionedGraph = function( drawGraph )
{
    this.DG = drawGraph;
};

PositionedGraph.prototype = {

    getBaseGraph: function()
    {
        return this.DG.GG;
    },
            
    getPosition: function( v )
    {
        // returns coordinates of node v         
        var x = this.DG.positions[v];
        
        var rank = this.DG.ranks[v];               
        
        var vertLevel = (this.DG.GG.type[v] == TYPE.CHILDHUB) ? this.DG.vertLevel.childEdgeLevel[v] : 1; 
        
        var y = this.DG.computeNodeY(rank, vertLevel);
               
        /* TODO
        if (this.DG.GG.type[v] == TYPE.RELATIONSHIP) {
            var partners = this.DG.GG.getInEdges(v);
            
            var level1 = this.DG.vertLevel.outEdgeVerticalLevel[partners[0]][v];
            var level2 = this.DG.vertLevel.outEdgeVerticalLevel[partners[1]][v];
            
            var y1 = this.DG.computeNodeY(rank, level1);
            var y2 = this.DG.computeNodeY(rank, level2);
            
            var edgeLevels = {};
            edgeLevels[partners[0]] = y1;
            edgeLevels[partners[1]] = y2;
            return {"x": x, "y": y, "partners": edgeLevels};
        }
        */
        
        return {"x": x, "y": y};
    },
    
    getAllNodes: function (minID, maxID)
    {
        var nodes = [];
        var minID = minID ? minID : 0;
        var maxID = maxID ? Math.min( maxID, this.DG.GG.getMaxRealVertexId()) : this.DG.GG.getMaxRealVertexId();
        for (var i = minID; i <= maxID; i++) {            
            if ( this.DG.GG.type[i] == TYPE.PERSON || this.DG.GG.type[i] == TYPE.RELATIONSHIP )
                nodes.push(i);
        }
        return nodes;
    },
    
    getPossibleChildrenOf: function( v )
    {
        // all person nodes which are not ancestors of v and which do not already have parents
        var result = [];

        for (var i = 0; i <= this.DG.GG.maxRealVertexId; i++) {
           if (this.DG.GG.type[i] != TYPE.PERSON) continue;
           if (this.DG.GG.inedges[i].length != 0) continue;
           if (this.DG.ancestors[v].hasOwnProperty(i)) continue;
           result.push(i);
        }

        return result;
    },

    getPossibleParentsOf: function( v )
    {
        // all person nodes which are not descendants of source node
        var result = [];

        for (var i = 0; i <= this.DG.GG.maxRealVertexId; i++) {
           if (this.DG.GG.type[i] != TYPE.PERSON) continue;
           if (this.DG.ancestors[i].hasOwnProperty(v)) continue;
           result.push(i);
        }

        return result;
    },

    getAllPersonsOfGenders: function (validGendersSet)
    {
        // all person nodes whose gender matches one of genders in the validGendersSet array

        // validate input genders
        for (var i = 0; i < validGendersSet.length; i++) {
            validGendersSet[i] = validGendersSet[i].toLowerCase();
            if (validGendersSet[i] != 'u' && validGendersSet[i] != 'm' && validGendersSet[i] != 'f')
                throw "Invalid gender: " + validGendersSet[i];
        }

         var result = [];

         for (var i = 0; i <= this.DG.GG.maxRealVertexId; i++) {
            if (this.DG.GG.type[i] != TYPE.PERSON) continue;
            var gender = this.DG.GG.properties[i]["gender"];
            //console.log("trying: " + i + ", gender: " + gender + ", validSet: " + stringifyObject(validGendersSet));
            if (arrayContains(validGendersSet, gender))
                result.push(i);
         }

         return result;
    },

    addNewChild: function( childhubId )
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
        var timer = new Timer();

        if (this.DG.GG.type[childhubId] != TYPE.CHILDHUB) {
            if (this.DG.GG.type[childhubId] == TYPE.RELATIONSHIP ) {
                childhubId = this.DG.GG.getOutEdges(childhubId)[0];
            }
            else
                throw "Assertion failed: adding children to a non-childhub node";
        }

        var insertRank = this.DG.ranks[childhubId] + 1;

        // find the best order to use for this new vertex: scan all orders on the rank, check number of crossed edges
        var insertOrder = this.findBestInsertPosition( insertRank, childhubId );

        // insert the vertex into the base graph
        var newNodeId = this.DG.G.insertVertex("_" + (this.DG.GG.getMaxRealVertexId()+1), TYPE.PERSON, {}, 1.0, [childhubId], []);

        // update GG, ranks, orders and positions - should make all those structures consistent
        // (once those are updated, regular DrawGraph methods - which may assume consistency - can be used to update the rest of the graph structures)
        this.updateGGRankOrderPositionsAfterNodeChange( newNodeId, insertRank, insertOrder, childhubId );

        // validate: by now the graph should satisfy all assumptions
        this.DG.GG.validate();

        // update vertical separation for all nodes & compute ancestors
        this.updateauxiliaryStructures();

        timer.printSinceLast("=== AddChild runtime: ");
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

    addNewParents: function( personId )
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
        var timer = new Timer();

        if (this.DG.GG.type[personId] != TYPE.PERSON)
            throw "Assertion failed: adding parents to a non-person node";

        if (this.DG.GG.getInEdges(personId).length > 0)
            throw "Assertion failed: adding parents to a person with parents";

        var positionsBefore  = this.DG.positions.slice(0);
        var ranksBefore      = this.DG.ranks.slice(0);        
        var vertLevelsBefore = this.DG.vertLevel.copy();
        var rankYBefore      = this.DG.rankY;

        var insertChildhubRank = this.DG.ranks[personId] - 1;

        // find the best order to use for this new vertex: scan all orders on the rank, check number of crossed edges
        var insertChildhubOrder = this.findBestInsertPosition( insertChildhubRank, personId );

        // insert the vertex into the base graph
        var newChildhubId = this.DG.G.insertVertex("_chhub" + (this.DG.GG.getMaxRealVertexId()+1), TYPE.CHILDHUB, {}, 1.0, [], [personId]);
        // update GG, ranks, orders and positions - should make all those structures consistent
        // (once those are updated, regular DrawGraph methods - which may assume consistency - can be used to update the rest of the graph structures)
        this.updateGGRankOrderPositionsAfterNodeChange( newChildhubId, insertChildhubRank, insertChildhubOrder, personId );

        var insertParentsRank = this.DG.ranks[newChildhubId] - 1;   // note: rank may have changed since last insertion
                                                                    //       (iff childhub was insertion above all at rank 0 - which becomes rank1)

        // find the best order to use for this new vertex: scan all orders on the rank, check number of crossed edges
        var insertParentOrder = this.findBestInsertPosition( insertParentsRank, newChildhubId );

        var newRelationshipId = this.DG.G.insertVertex("_rel" + (this.DG.GG.getMaxRealVertexId()+1), TYPE.RELATIONSHIP, {}, 1.0, [], [newChildhubId]);
        this.updateGGRankOrderPositionsAfterNodeChange( newRelationshipId, insertParentsRank, insertParentOrder, newChildhubId );

        insertParentsRank = this.DG.ranks[newRelationshipId];       // note: rank may have changed since last insertion again
                                                                    //       (iff relationship was insertion above all at rank 0 - which becomes rank1)

        var newParent1Id = this.DG.G.insertVertex("_" + (this.DG.GG.getMaxRealVertexId()+1), TYPE.PERSON, {}, 1.0, [], [newRelationshipId]);
        this.updateGGRankOrderPositionsAfterNodeChange( newParent1Id, insertParentsRank, insertParentOrder + 1, newRelationshipId );

        var newParent2Id = this.DG.G.insertVertex("_" + (this.DG.GG.getMaxRealVertexId()+1), TYPE.PERSON, {}, 1.0, [], [newRelationshipId]);
        this.updateGGRankOrderPositionsAfterNodeChange( newParent2Id, insertParentsRank, insertParentOrder, newRelationshipId );

        // validate: by now the graph should satisfy all assumptions
        this.DG.GG.validate();


        // update vertical separation for all nodes & compute ancestors
        this.updateauxiliaryStructures();

        timer.printSinceLast("=== NewParents runtime: ");
        console.log("======= after ========");
        console.log("== GG:");
        console.log(stringifyObject(this.DG.GG));
        console.log("== Ranks:");
        console.log(stringifyObject(this.DG.ranks));
        console.log("== Orders:");
        console.log(stringifyObject(this.DG.order));
        console.log("== Positions:");
        console.log(stringifyObject(this.DG.positions));

        var movedNodes = this.findMovedNodes( positionsBefore, 4, ranksBefore, vertLevelsBefore, rankYBefore );  // "4" == inserted 4 new nodes => positionsBefore do not have 4 real nodes present in the graph now

        var newNodes = [newRelationshipId, newParent1Id, newParent2Id];

        return {"new": newNodes, "moved": movedNodes};
    },

    addNewRelationship: function( personId )
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
        var timer = new Timer();

        if (this.DG.GG.type[personId] != TYPE.PERSON)
            throw "Assertion failed: adding relationship to a non-person node";

        var positionsBefore  = this.DG.positions.slice(0);
        var ranksBefore      = this.DG.ranks.slice(0);
        var vertLevelsBefore = this.DG.vertLevel.copy();
        var rankYBefore      = this.DG.rankY;
        
        var insertRank  = this.DG.ranks[personId];
        var personOrder = this.DG.order.vOrder[personId];

        // a few special cases which involve not only insertions but also existing node rearrangements:
        this.swapPartnerToBringToSideIfPossible( personId );
        
        // find the best order to use for this new vertex: scan all orders on the rank, check number of crossed edges
        var insertOrder = this.findBestInsertPosition( insertRank, personId );

        var newRelationshipId = this.DG.G.insertVertex("_rel" + (this.DG.GG.getMaxRealVertexId()+1), TYPE.RELATIONSHIP, {}, 1.0, [personId], []);
        this.updateGGRankOrderPositionsAfterNodeChange( newRelationshipId, insertRank, insertOrder, personId );

        var insertPersonOrder = (insertOrder > personOrder) ? insertOrder + 1 : insertOrder;

        var newPersonId = this.DG.G.insertVertex("_" + (this.DG.GG.getMaxRealVertexId()+1), TYPE.PERSON, {}, 1.0, [], [newRelationshipId]);
        this.updateGGRankOrderPositionsAfterNodeChange( newPersonId, insertRank, insertPersonOrder, newRelationshipId );

        var insertChildhubRank  = insertRank + 1;
        var insertChildhubOrder = this.findBestInsertPosition( insertChildhubRank, newRelationshipId );
        var newChildhubId       = this.DG.G.insertVertex("_chhub" + (this.DG.GG.getMaxRealVertexId()+1), TYPE.CHILDHUB, {}, 1.0, [newRelationshipId], []);
        this.updateGGRankOrderPositionsAfterNodeChange( newChildhubId, insertChildhubRank, insertChildhubOrder, newRelationshipId );

        var insertChildRank  = insertChildhubRank + 1;
        var insertChildOrder = this.findBestInsertPosition( insertChildRank, newChildhubId );
        var newChildId       = this.DG.G.insertVertex("_" + (this.DG.GG.getMaxRealVertexId()+1), TYPE.PERSON, {}, 1.0, [newChildhubId], []);
        this.updateGGRankOrderPositionsAfterNodeChange( newChildId, insertChildRank, insertChildOrder, newChildhubId );

        // validate: by now the graph should satisfy all assumptions
        this.DG.GG.validate();


        // update vertical separation for all nodes & compute ancestors
        this.updateauxiliaryStructures();

        timer.printSinceLast("=== NewRelationship runtime: ");
        console.log("======= after ========");
        console.log("== GG:");
        console.log(stringifyObject(this.DG.GG));
        console.log("== Ranks:");
        console.log(stringifyObject(this.DG.ranks));
        console.log("== Orders:");
        console.log(stringifyObject(this.DG.order));
        console.log("== Positions:");
        console.log(stringifyObject(this.DG.positions));

        //this.DG.displayGraph(this.DG.positions, "zz");

        var movedNodes = this.findMovedNodes( positionsBefore, 4, ranksBefore, vertLevelsBefore, rankYBefore );  // "4" == inserted 4 new nodes => positionsBefore do not have 4 real nodes present in the graph now

        var newNodes = [newRelationshipId, newPersonId, newChildId];

        return {"new": newNodes, "moved": movedNodes};
    },

    repositionAll: function ()
    {
        this.DG.positions = this.DG.position(this.DG.horizontalPersonSeparationDist, this.DG.horizontalRelSeparationDist);
    },

    redrawAll: function ()
    {
        this.DG = new DrawGraph( this.DG.G,
                                 this.DG.horizontalPersonSeparationDist,
                                 this.DG.horizontalRelSeparationDist,
                                 this.DG.maxInitOrderingBuckets,
                                 this.DG.maxOrderingIterations,
                                 this.DG.maxXcoordIterations );
    },

    toJSON: function ()
    {
        var output = {};

        // note: need to save GG not base G becaus eof the graph was dynamically modified
        //       some new virtual edges may have different ID than if underlying G were
        //       converted to GG (as during such a conversion ranks would be correctly
        //       recomputed, but orders may mismatch). Thus to keep ordering valid need
        //       to save GG and restore G from it on de-serialization
        output["GG"] = this.DG.GG.serialize();

        output["ranks"]     = this.DG.ranks;
        output["order"]     = this.DG.order.serialize();
        output["positions"] = this.DG.positions;

        // note: everything else can be recomputed based on the information above

        console.log(JSON.stringify(output));

        return JSON.stringify(output);
    },

    fromJSON: function (serializedAsJSON)
    {
        var removedNodes = this.getAllNodes();
        
        serializedData = JSON.parse(serializedAsJSON);

        console.log("Got serialization object: " + stringifyObject(serializedData));

        this.DG.GG = InternalGraph.init_from_user_graph(serializedData["GG"],
                                                        this.DG.GG.defaultPersonNodeWidth, this.DG.GG.defaultNonPersonNodeWidth,
                                                        true);

        this.DG.G = this.DG.GG.makeGWithCollapsedMultiRankEdges();

        this.DG.ranks = serializedData["ranks"];

        this.DG.maxRank = Math.max.apply(null, this.DG.ranks);

        this.DG.order.deserialize(serializedData["order"]);

        this.DG.positions = serializedData["positions"];

        this.updateauxiliaryStructures();
        
        this.screenRankShift = 0;
                
        var newNodes = this.getAllNodes();
        
        return {"new": newNodes, "removed": removedNodes};
    },

    getPathToParents: function(v)
    {
        // returns [ [virtual_node_1, virtual_node_2, ..., parent1] [virtual_node_1, virtual_node_2, ..., parent2] ]

        var result = [];

        if (this.DG.GG.type[v] != TYPE.RELATIONSHIP)
            throw "Assertion failed: incorrect v in getPathToParents()";

        var inEdges = this.DG.GG.getInEdges(v);

        result.push( this.getPathEndingInPerson(inEdges[0]) );
        result.push( this.getPathEndingInPerson(inEdges[1]) );

        return result;
    },

    //=============================================================

    updateGGRankOrderPositionsAfterNodeChange: function (newNodeId, insertRank, insertOrder, connectedNodeId)
    {
        // does not assume the graph is consistent at this point, e.g. ther emay be childhubs with no relationships,
        // or relationships without persons attached

        if (newNodeId != this.DG.G.getMaxRealVertexId())
            throw "Assertion failed: trying to update after an insert with a strange ID (not max ID)!";

        if (insertRank == 0) {
            for (var i = 0; i < this.DG.ranks.length; i++)
                this.DG.ranks[i]++;
            this.DG.maxRank++;

            this.DG.order.insertRank(1);

            insertRank = 1;
        }
        else
        {
            if (insertRank > this.DG.maxRank) {
                this.DG.maxRank = insertRank;

                this.DG.order.insertRank(insertRank);
            }
        }

        this.DG.ranks[newNodeId] = insertRank;   // note: it is OK to overwrite rank of old virtual node with the same id as new node -
                                                 //       makeGWithSplitMultiRankEdges() will take care of all virtual nodes

        // re-create the processed graph, which will also re-create all virtual vertices and update their ranks
        this.DG.GG = this.DG.G.makeGWithSplitMultiRankEdges(this.DG.ranks, this.DG.maxRank, true);

        // update orders
        this.DG.order.insertAndShiftAllIdsAboveVByOne(newNodeId, insertRank, insertOrder);

        // update positions
        this.updatePositionsAfterNodeInsert( newNodeId, insertOrder, insertRank, connectedNodeId );

    },

    updateauxiliaryStructures: function()
    {
        // update vertical levels
        this.DG.vertLevel = this.DG.positionVertically();
        this.DG.rankY     = this.DG.computeRankY();

        // update ancestors
        var ancestors = this.DG.findAllAncestors();
        this.DG.ancestors = ancestors.ancestors;
        this.DG.consangr  = ancestors.consangr;
    },

    findMovedNodes: function (positionsBefore, numNewInserted, ranksBefore, vertLevelsBefore, rankYBefore)
    {
        //console.log("Before: " + stringifyObject(vertLevelsBefore));
        //console.log("After:  " + stringifyObject(this.DG.vertLevel));
        
        //console.log("Before: " + stringifyObject(positionsBefore));
        //console.log("After: " + stringifyObject(this.DG.positions));

        var maxOldID = this.DG.GG.maxRealVertexId - numNewInserted; 
            
        // TODO: check vertLevelsBefore.rankVerticalLevels + move all vertices at lower ranks
        
        var result = {};
        
        for (var i = 0; i <= maxOldID; i++) {
            // this node was moved            
            if (this.DG.GG.type[i] == TYPE.RELATIONSHIP || this.DG.GG.type[i] == TYPE.PERSON)
            {
                var rank = this.DG.ranks[i];
                if (rank != ranksBefore[i]) {
                    this.addNodeAndAssociatedRelationships(i, result, maxOldID);
                    continue;                    
                }                
                if (this.DG.rankY[rank] != rankYBefore[rank]) {
                    this.addNodeAndAssociatedRelationships(i, result, maxOldID);
                    continue;                    
                }                
                if (this.DG.positions[i] != positionsBefore[i]) {
                    this.addNodeAndAssociatedRelationships(i, result, maxOldID);
                    continue;
                }
                // or it is a relationship with a long edge - redraw just in case since long edges may have complicated curves around other nodes
                if (this.DG.GG.type[i] == TYPE.RELATIONSHIP) {
                    var inEdges = this.DG.GG.getInEdges(i);                    
                    if (inEdges[0] > this.DG.GG.maxRealVertexId || inEdges[1] > this.DG.GG.maxRealVertexId) {
                        result[i] = true;
                        continue;
                    }                    
                    var childHub = this.DG.GG.getOutEdges(i)[0];
                    if (vertLevelsBefore.childEdgeLevel[childHub] != this.DG.vertLevel.childEdgeLevel[childHub]) {
                        result[i] = true;
                        continue;
                    }
                }
            }
        }
        
        var resultArray = [];
        for (var node in result) {
            if (result.hasOwnProperty(node)) {
                resultArray.push(node);
            }
        }        

        return resultArray;
    },
    
    addNodeAndAssociatedRelationships: function ( node, addToSet, maxOldID )
    {
        addToSet[node] = true;
        
        if (this.DG.GG.type[node] != TYPE.PERSON) return;
        
        var inEdges = this.DG.GG.getInEdges(node);        
        if (inEdges.length > 0) {
            var parentChildhub     = inEdges[0];
            var parentRelationship = this.DG.GG.getInEdges(parentChildhub)[0];
            if (parentRelationship <= maxOldID)
                addToSet[parentRelationship] = true;
        }
        
        var outEdges = this.DG.GG.getOutEdges(node);
        for (var i = 0; i < outEdges.length; i++) {
            if (outEdges[i] <= maxOldID)
                addToSet[ outEdges[i] ] = true;
        }
    },
    
    swapPartnerToBringToSideIfPossible: function ( personId )
    {
        // attempts to swap this person with it's existing partner if the swap makes the not-yet-parnered
        // side of the person on the side which favours child insertion (e.g. the side where the child closest
        // to the side has no parners)
        
        var rank  = this.DG.ranks[personId];
        var order = this.DG.order.vOrder[personId];
        
        var outEdges = this.DG.GG.getOutEdges(personId);
        if (outEdges.length != 1) return;  // only if have exactly one parner
        
        var relationship = outEdges[0];
        var relOrder     = this.DG.order.vOrder[relationship];
        
        var partners = this.DG.GG.getInEdges(relationship);
        
        var partnerId      = (partners[0] == personId) ? partners[1] : partners[0];
        var parnerOutEdges = this.DG.GG.getOutEdges(partnerId);
        if (parnerOutEdges.length != 1) return;  // only if parner also has exactly one parner (which is personId)
        
        var partnerOrder = this.DG.order.vOrder[partnerId];        
        if (partnerOrder != order - 2 && partnerOrder != order + 2) return;  // only if next to each other
               
        var childhubId = this.DG.GG.getOutEdges(relationship)[0];
        var children   = this.DG.GG.getOutEdges(childhubId);
        
        if (children.length == 0) return;

        // TODO: count how many edges will be crossed in each case and only swap if we save a few crossings
        
        // idea:
        // if (to the left  of parner && leftmostChild  has parner to the left  && rightmostchid has no parner to the right) -> swap
        // if (to the right of parner && rightmostChild has parner to the right && leftmostchid  has no parner to the left) -> swap
        
        var toTheLeft = (order < partnerOrder);
        
        var leftMostChildOrder  = Infinity;
        var leftMostHasLParner  = false;
        var rightMostChildOrder = -Infinity;
        var rightMostHasRParner = false;
        for (var i = 0; i < children.length; i++) {
            var childId = children[i];            
            var order   = this.DG.order.vOrder[childId];
            
            if (order < leftMostChildOrder) {
                leftMostChildOrder = order;
                leftMostHasLParner = this.hasParnerBetweenOrders(childId, 0, order-1);  // has partner to the left
            }
            if (order > rightMostChildOrder) {
                rightMostChildOrder = order;
                rightMostHasRParner = this.hasParnerBetweenOrders(childId, order+1, Infinity);  // has partner to the right
            }
        }
        
        if ( (toTheLeft  && leftMostHasLParner  && !rightMostHasRParner) ||
             (!toTheLeft && rightMostHasRParner && !leftMostHasLParner) ) {
            this.swapParners( personId, partnerId, relationship );  // updates orders + positions
        }       
    },

    hasParnerBetweenOrders: function( personId, minOrder, maxOrder )
    {
        var rank  = this.DG.ranks[personId];
        var order = this.DG.order.vOrder[personId];
        
        var outEdges = this.DG.GG.getOutEdges(personId);
        
        for (var i = 0; i < outEdges.length; i++ ) {        
            var relationship = outEdges[i];
            var relRank      = this.DG.ranks[relationship];
            if (relRank != rank) continue;
            
            var relOrder = this.DG.order.vOrder[relationship];
            if (relOrder >= minOrder && relOrder <= maxOrder)
                return true;
        }
        
        return false;
    },
    
    swapParners: function( partner1, partner2, relationshipId)
    {        
        var rank = this.DG.ranks[partner1];
        if (this.DG.ranks[partner2] != rank || this.DG.ranks[relationshipId] != rank)
            throw "Assertion failed: swapping nodes of different ranks";
        
        var order1   = this.DG.order.vOrder[partner1];
        var order2   = this.DG.order.vOrder[partner2];
        var orderRel = this.DG.order.vOrder[relationshipId];
        
        // normalize: partner1 always to the left pf partner2, relationship in the middle
        if (order1 > order2) {
            var tmpOrder = order1;
            var tmpId    = partner1;
            order1   = order2;
            partner1 = partner2;
            order2   = tmpOrder;
            partner2 = tmpId;            
        }
        
        if ( (order1 + 1) != orderRel || (orderRel + 1) != order2 ) return;
        
        this.DG.order.exchange(rank, order1, order2);
        
        var widthDecrease = this.DG.GG.getVertexWidth(partner1) - this.DG.GG.getVertexWidth(partner2);
        
        var pos2 = this.DG.positions[partner2];        
        this.DG.positions[partner2] = this.DG.positions[partner1];
        this.DG.positions[partner1] = pos2 - widthDecrease;
        this.DG.positions[relationshipId] -= widthDecrease;
    },
        
    //=============================================================

    findBestInsertPosition: function ( rank, edgeToV )
    {
        if (rank == 0 || rank > this.DG.maxRank)
            return 0;

        // note: does not assert the graph satisfies all the assumptions in InternalGraph.validate()

        // find the order on rank 'rank' to insert a new vertex so that the edge connecting this new vertex
        // and vertex 'edgeToV' crosses the smallest number of edges.
        var edgeToRank      = this.DG.ranks[ edgeToV ];
        var edgeToOrder     = this.DG.order.vOrder[edgeToV];

        if (edgeToRank == rank && this.DG.GG.type[edgeToV] == TYPE.PERSON)
            // for same-rank edges we don't need to scan through all the vertices on the rank,
            // we just need to pick on which side of the initial vertex to insert new one
            return this.findBestRelationshipPosition( rank, edgeToV, edgeToOrder );

        var bestInsertOrder  = 0;
        var bestCrossings    = Infinity;
        var bestDistance     = Infinity;

        var desiredPosition = this.DG.order.order[rank].length;  // by default: the later in the order the better: fewer vertices shifted

        if (this.DG.GG.type[edgeToV] == TYPE.CHILDHUB && this.DG.GG.getOutEdges(edgeToV).length > 0)   // for childhubs with children - next to other children
            desiredPosition = this.findRightmostChildPosition(edgeToV) + 1;

        for (var o = 0; o <= this.DG.order.order[rank].length; o++) {
            var numCrossings = this.edgeCrossingsByFutureEdge( rank, o - 0.5, edgeToRank, edgeToOrder );

            //console.log("position: " + o + ", numCross: " + numCrossings);

            if ( numCrossings < bestCrossings ||                           // less crossings
                 (numCrossings == bestCrossings && Math.abs(o - desiredPosition) <= bestDistance )   // closer to desired position
               ) {
               bestInsertOrder = o;
               bestCrossings   = numCrossings;
               bestDistance    = Math.abs(o - desiredPosition);
            }
        }

        return bestInsertOrder;
    },

    findRightmostChildPosition: function ( vertex )
    {
        var outEdges = this.DG.GG.getOutEdges(vertex);

        var rightMostChildPos = 0;

        for (var i = 0; i < outEdges.length; i++)
            if (this.DG.order.vOrder[outEdges[i]] > rightMostChildPos)
                rightMostChildPos = this.DG.order.vOrder[outEdges[i]];

        return rightMostChildPos;
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

        var crossings = 0;

        if (rankFrom == rankTo) throw "TODO: probably not needed";

        // For multi-rank edges, crossing occurs if either
        // 1) there is an edge going from rank[v]-ranked vertex with a smaller order
        //     than v to a rank[targetV]-ranked vertex with a larger order than targetV
        // 2) there is an edge going from rank[v]-ranked vertex with a larger order
        //     than v to a rank[targetV]-ranked vertex with a smaller order than targetV

        var verticesAtRankTo = this.DG.order.order[ rankTo ];

        for (var ord = 0; ord < verticesAtRankTo.length; ord++) {
            if ( ord == orderTo ) continue;

            var vertex = verticesAtRankTo[ord];

            var inEdges = this.DG.GG.getInEdges(vertex);
            var len     = inEdges.length;

            for (var j = 0; j < len; j++) {
                var target = inEdges[j];

                var penalty = 1;
                if (this.DG.GG.type[target] = TYPE.CHILDHUB)
                    penalty = Infinity;

                var orderTarget = this.DG.order.vOrder[target];
                var rankTarget  = this.DG.ranks[target];

                if (rankTarget == rankTo)
                {
                    if ( ord < orderTo && orderTarget > orderTo ||
                         ord > orderTo && orderTarget < orderTo )
                         crossings += 2;
                }
                else
                {
                    if (ord < orderTo && orderTarget > orderFrom ||
                        ord > orderTo && orderTarget < orderFrom )
                        crossings += penalty;
                }
            }
        }

        // try not to insert inbetween other relationships
        // (for that only need check edges on the same rank)
        var verticesAtRankFrom = this.DG.order.order[ rankFrom ];
        for (var ord = 0; ord < verticesAtRankFrom.length; ord++) {
            if ( ord == orderFrom ) continue;

            var vertex = verticesAtRankFrom[ord];

            var outEdges = this.DG.GG.getOutEdges(vertex);
            var len      = outEdges.length;

            for (var j = 0; j < len; j++) {
                var target = outEdges[j];

                var orderTarget = this.DG.order.vOrder[target];
                var rankTarget  = this.DG.ranks[target];

                if (rankTarget == rankFrom)
                {
                    if ( fromOrder < ord && fromOrder > orderTarget ||
                         fromOrder > ord && fromOrder < orderTarget )
                         crossings += 0.1;
                }
            }
        }


        return crossings;
    },

    findBestRelationshipPosition: function ( rank, v, vOrder )
    {
        // for same-rank edges we don't need to scan through all the vertices on the rank,
        // we just need to pick on which side of the initial vertex to insert new one
        // (given everything else being equal, prefer the right side - to move fewer nodes)

        var outEdges = this.DG.GG.getOutEdges(v);

        var rightOf = 0;
        var leftOf  = 0;

        for (var i = 0; i < outEdges.length; i++) {
            var u = outEdges[i];
            if (this.DG.ranks[u] != rank) continue;

            if (this.DG.order.vOrder[u] > vOrder)
                rightOf++;
            else
                leftOf++;
        }

        if (rightOf > leftOf) return vOrder;
        return vOrder + 1;
    },

    //=============================================================

    updatePositionsAfterNodeInsert: function ( newNodeId, insertOrder, insertRank, connectedNodeId )
    {
        // algorithm:
        // 1) insert new node according to its order, the exact X-coordinate is picked accoridng to
        //    a heuristic which tries to keep edges straight and move as few vertices as possible
        //    (vertices earlier in the order are never moved). If the node to the right has to move,
        //    move the minimum required distance, and add it to the queue of disturbed nodes
        //
        // 2) while queue is not empty: check which nodes were affected because of the shift of the
        ///   node poped from the queue: nodes to the right, parents & children. Shift those
        //    accordingly (see below) and add them to the queue.
        //
        //    The rules are:
        //    a) generally all shifted nodes will be shifted the same amount to keep the shape of
        //       the graph as unmodified as possible, with a few exception below
        //    b) all childhubs should stay right below their relationship nodes
        //    c) childhubs wont be shifted while they ramain between the leftmost and rightmost child
        //    d) when a part of the graph needs to be stretched prefer to strech relationship edges
        //       to the right of relationship node. Some of the heuristics below assume that this is the
        //       part that may have been stretched
        //
        // note: does not assert the graph satisfies all the assumptions in InternalGraph.validate(),
        //       in particular this can be called after a childhub was added but before it's relationship was added

        this.DG.positions.splice( newNodeId, 0, -1 );  // temporary -1 position: to bring this.DG.positions in sync with new node IDs

        var xcoord = new XCoord();
        xcoord.init(this.DG.positions, this.DG.horizontalPersonSeparationDist, this.DG.horizontalRelSeparationDist,
                    this.DG.GG.vWidth, this.DG.order, this.DG.ranks, this.DG.GG.type);

        var leftBoundary  = xcoord.getLeftMostNoDisturbPosition(newNodeId, true);   // true: allow negative coordinates: will be normalized
        var rightBoundary = xcoord.getRightMostNoDisturbPosition(newNodeId);

        var desiredPosition = this.DG.positions[connectedNodeId];   // insert right above or right below
        if (this.DG.ranks[connectedNodeId] == insertRank) {         // insert on the same rank: then instead ot the left or to the right
            if (this.DG.order.vOrder[newNodeId] > this.DG.order.vOrder[connectedNodeId])
                desiredPosition = xcoord.getRightEdge(connectedNodeId) + xcoord.getSeparation(newNodeId, connectedNodeId) + xcoord.halfWidth[newNodeId];
            else
                desiredPosition = xcoord.getLeftEdge(connectedNodeId) - xcoord.getSeparation(newNodeId, connectedNodeId) - xcoord.halfWidth[newNodeId];
        }

        if ( desiredPosition < leftBoundary )
            insertPosition = leftBoundary;
        else
        if ( desiredPosition > rightBoundary )
            insertPosition = Math.max(leftBoundary, rightBoundary);   // if we insert between two closedly packed nodes, leftBoundary will be greater than rightBoundary
        else
            insertPosition = desiredPosition;

        //console.log("Position: " + insertOrder + ", leftBoundary: " + leftBoundary + ", right: " + rightBoundary + ", desired: " + desiredPosition + ", actualInsert: " + insertPosition);

        xcoord.xcoord[newNodeId] = insertPosition;

        // find which nodes we need to shift to accomodate this insertion via "domino effect"

        var alreadyProcessed = {};
        alreadyProcessed[newNodeId] = true;

        var shiftAmount = 0;

        var disturbedNodes = new Queue();
        disturbedNodes.push( newNodeId );

        var iter = 0;

        do {

            var childrenMoved = {};   // we only move a chldhub if all its nodes have moved

            // small loop 1: shift all vertices except chldhubs, which only shift if all children shift
            while ( disturbedNodes.size() > 0 && iter < 100) {

                iter++;

                var v = disturbedNodes.pop();

                var type  = this.DG.GG.type[v];
                var vrank = this.DG.ranks[v];

                var position    = xcoord.xcoord[v];
                var rightMostOK = xcoord.getRightMostNoDisturbPosition(v);

                //console.log("iter: " + iter + ", v: " + v + ", pos: " + position + ", righNoDisturb: " + rightMostOK + ", shift: " + shiftAmount + ", al[7]: " + alreadyProcessed[7]);

                if (position > rightMostOK) {
                    // the node to the right was disturbed: shift it
                    var vorder         = this.DG.order.vOrder[v];
                    var rightDisturbed = this.DG.order.order[vrank][vorder+1];

                    if (alreadyProcessed.hasOwnProperty(rightDisturbed)) continue;

                    var toMove = position - rightMostOK;
                    if (toMove > shiftAmount)
                        shiftAmount = toMove;

                    alreadyProcessed[rightDisturbed] = true;
                    xcoord.xcoord[rightDisturbed] += shiftAmount;
                    disturbedNodes.push(rightDisturbed);
                    console.log("add1: " + rightDisturbed + " (toMove: " + toMove +")");
                }

                var inEdges  = this.DG.GG.getInEdges(v);
                var outEdges = this.DG.GG.getOutEdges(v);

                // force childhubs right below relationships.
                if (type == TYPE.RELATIONSHIP && outEdges.length == 1) {
                    var childHubId = outEdges[0];
                    var childPos   = xcoord.xcoord[childHubId];
                    var toMove     = position - childPos;
                    if (toMove > shiftAmount)
                        shiftAmount = toMove;
                    //console.log("----- id: " + childHubId + ", pos: " + childPos + ", move: " + toMove);
                }

                // go though out- and in- edges and propagate the movement

                //---------
                var skipInEdges = false;
                if (type == TYPE.PERSON && v == newNodeId)
                    skipInEdges = true;
                // if we need to strech something -> stretch relationship edges to the right of
                if (type == TYPE.RELATIONSHIP) {
                    skipInEdges = true;
                    // except the case when inedge comes from a vertex to the left with no other in- or out-edges (a node connected only to this reltionship)
                    if (inEdges.length == 2) {
                        var parent0 = inEdges[0];
                        var parent1 = inEdges[1];
                        var order0 = this.DG.order.vOrder[parent0];
                        var order1 = this.DG.order.vOrder[parent1];
                        if (order0 < order1 && this.DG.GG.getOutEdges(parent0).length == 1 && this.DG.GG.getInEdges(parent0).length == 0)
                            skipInEdges = false;
                        else if (order1 < order0 && this.DG.GG.getOutEdges(parent1).length == 1 && this.DG.GG.getInEdges(parent1).length == 0)
                            skipInEdges = false;
                    }
                }

                if (!skipInEdges) {
                    for (var i = 0; i < inEdges.length; i++) {
                        var u     = inEdges[i];
                        var typeU = this.DG.GG.type[u];

                        if (alreadyProcessed.hasOwnProperty(u)) continue;

                        if (type == TYPE.PERSON && typeU == TYPE.CHILDHUB) {
                            if (childrenMoved.hasOwnProperty(u))
                                childrenMoved[u]++;
                            else
                                childrenMoved[u] = 1;

                            continue;
                        }

                        alreadyProcessed[u] = true;
                        xcoord.xcoord[u] += shiftAmount;
                        disturbedNodes.push(u);
                        console.log("add2: " + u);
                    }
                }
                //---------

                //---------
                if (type == TYPE.CHILDHUB) {
                    //if (inEdges.length > 0) {
                    //    var relNodeId = inEdges[0];
                    //    if (xcoord.xcoord[relNodeId] > xcoord.xcoord[v]
                    //}

                    var rightMostChildPos = 0;
                    for (var i = 0; i < outEdges.length; i++) {
                        var u   = outEdges[i];
                        var pos = xcoord.xcoord[u];
                        if (pos > rightMostChildPos)
                            rightMostChildPos = pos;
                    }
                    if (rightMostChildPos >= xcoord.xcoord[v]) continue; // do not shift children if we are not creating a "bend"
                }

                for (var i = 0; i < outEdges.length; i++) {
                    var u = outEdges[i];

                    if ( this.DG.ranks[u] == vrank ) continue;   // vertices on the same rank will only be shifted if pushed ot the right by left neighbours
                    if ( alreadyProcessed.hasOwnProperty(u) ) continue;
                    if (type == TYPE.RELATIONSHIP && xcoord.xcoord[u] >= xcoord.xcoord[v]) continue;

                    alreadyProcessed[u] = true;
                    xcoord.xcoord[u] += shiftAmount;
                    disturbedNodes.push(u);
                    console.log("add3: " + u);
                }
                //---------
            }


            // small loop 2: shift childhubs, if necessary
            for (var chhub in childrenMoved) {
                if (childrenMoved.hasOwnProperty(chhub)) {
                    if (this.DG.GG.getOutEdges(chhub).length == childrenMoved[chhub]) {
                        if (!alreadyProcessed.hasOwnProperty(chhub)) {
                            alreadyProcessed[chhub] = true;
                            xcoord.xcoord[chhub] += shiftAmount;
                            disturbedNodes.push(chhub);
                        }
                    }
                }
            }

        // propagate this childhub movement and keep going
        }
        while ( disturbedNodes.size() > 0 && iter < 100 );

        xcoord.normalize();

        this.DG.positions = xcoord.xcoord;

        console.log("ADDED: " + newNodeId + " @ position " + this.DG.positions[newNodeId]);
    },

    //=============================================================

    getPathEndingInPerson: function(v)
    {
        var path = [v];

        while (this.DG.GG.type[v] != TYPE.PERSON)
        {
            v = this.DG.GG.getInEdges(v)[0];
            path.push(v);
        }

        return path;
    }

};

