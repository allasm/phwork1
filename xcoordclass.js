XCoord = function() {
    this.xcoord = [] ; // coordinates of _center_ of every vertex

    // local copies just for convenience & performance
    this.halfWidth = [];

    this.horizPersSeparationDist = undefined;
    this.horizRelSeparationDist  = undefined;

    this.order = undefined;
    this.ranks = undefined;
    this.type  = undefined;
};

XCoord.prototype = {

    init: function (xinit, horizontalPersonSeparationDist, horizontalRelSeparationDist, widths, order, ranks, type) {
        this.xcoord = xinit;

        this.horizPersSeparationDist = horizontalPersonSeparationDist;
        this.horizRelSeparationDist  = horizontalRelSeparationDist;

        for (var i = 0; i < widths.length; i++)
            this.halfWidth[i] = Math.floor(widths[i]/2);

        this.order = order;

        this.ranks = ranks;

        this.type  = type;
    },

    getLeftMostNoDisturbPosition: function(v) {
        var leftBoundary = this.halfWidth[v];

        var order = this.order.vOrder[v];
        if ( order > 0 ) {
            var leftNeighbour = this.order.order[this.ranks[v]][order-1];

            var separation = this.horizPersSeparationDist;
            //if (this.type[v] == TYPE.RELATIONSHIP || this.type[leftNeighbour] == TYPE.RELATIONSHIP)
            //    separation = this.horizRelSeparationDist;

            leftBoundary += this.getRightEdge(leftNeighbour) + separation;
        }

        return leftBoundary;
    },

    getRightMostNoDisturbPosition: function(v) {
        var rightBoundary = -1;

        var order = this.order.vOrder[v];
        if ( order < this.order.order[this.ranks[v]].length-1 ) {
            var rightNeighbour = this.order.order[this.ranks[v]][order+1];
            rightBoundary = this.getLeftEdge(rightNeighbour) - this.horizPersSeparationDist - this.halfWidth[v];
        }

        return rightBoundary;
    },

    getLeftEdge: function(v) {
        return this.xcoord[v] - this.halfWidth[v];
    },

    getRightEdge: function(v) {
        return this.xcoord[v] + this.halfWidth[v];
    },

    shiftLeftOneVertex: function (v, amount) {
        // attempts to move vertex v to the left by ``amount``, but stops
        // as soon as it hits it's left neighbour

        var leftBoundary = this.getLeftMostNoDisturbPosition(v);

        var actualShift = Math.min( amount, this.xcoord[v] - leftBoundary );

        this.xcoord[v] -= actualShift;

        return actualShift;
    },

    shiftRightAndShiftOtherIfNecessary: function (v, amount) {
        // shifts a vertext to the right by the given ``amount``, and shifts
        // all right neighbours, the minimal amount to accomodate this shift
        this.xcoord[v] += amount;

        var rightEdge = this.getRightEdge(v);
        var rank      = this.ranks[v];
        var order     = this.order.vOrder[v];

        for (var i = order + 1; i < this.order.order[rank].length; i++) {
            var rightNeighbour = this.order.order[rank][i];

            if (this.getLeftEdge(rightNeighbour) >= rightEdge + this.horizPersSeparationDist) {
                // we are not interfering with the vertex to the right
                break;

            }

            this.xcoord[rightNeighbour] = rightEdge + this.horizPersSeparationDist + this.halfWidth[rightNeighbour];

            rightEdge = this.getRightEdge(rightNeighbour);
        }

        return amount;
    },

    normalize: function() {
        // finds the smallest margin on the left and shifts the entire graph to the left
        var minExtra = this.xcoord[0] - this.halfWidth[0];
        for (var i = 1; i < this.xcoord.length; i++) {
            if ((this.xcoord[i] - this.halfWidth[i]) < minExtra)
                minExtra = (this.xcoord[i] - this.halfWidth[i]);
        }

        for (var i = 0; i < this.xcoord.length; i++) {
            this.xcoord[i] -= minExtra;
        }
    },

    copy: function () {
        // returns a deep copy
        var newX = new XCoord();

        newX.xcoord = this.xcoord.slice(0);

        newX.halfWidth               = this.halfWidth;
        newX.horizPersSeparationDist = this.horizPersSeparationDist;
        newX.horizRelSeparationDist  = this.horizRelSeparationDist;
        newX.order                   = this.order;
        newX.ranks                   = this.ranks;
        newX.type                    = this.type;

        return newX;
    }
};




VerticalLevels = function() {

    this.rankVerticalLevels   = [];   // for each rank: how many "levels" of horizontal edges are between this and next ranks
    this.childEdgeLevel       = [];   // for each "childhub" node contains the verticalLevelID to use for the child edges
                                      // (where levelID is for levels between this and next ranks)
    this.outEdgeVerticalLevel = [];   // for each "person" node contains outgoing relationship edge level as {target1: level1, t2: l2}
                                      // (where levelID is for levels between this and previous ranks)
};

VerticalLevels.prototype = {

};

