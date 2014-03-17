// How this matrix works: as edges are processed, each matrix element [x][y]
// is the number of crossings an edge connecting x and y adds to the total.
// X is the set of vertices on one rank, Y on the other.
//
// Must be filled with 0s, and then populated by edges going from lower order
// to higher order, adding 1 to each affected square as edges are processed:
// once an edge X->Y is found, the current value of [X][Y] is added to the total numCrossings,
// and 1 is added to all squares where x>X (X has higher order than X) and
// y<Y (has lower order than Y)
//
// Example:
//
//  edges: 1-c, 1-e, 2-a, 2-c, 3-d, 4-b, 4-d, 5-c
//  numCrossings: 12
//
//  [1]  [2]  [3]  [4]  [5]
//   \ \ | \   \   | |    |
//    \ \-+-+---+--+-+-\  /
//     \_/   \   \/  |  \/
//      /\__ -+-/ \__|__/\
//     /    /\ \ / \ |    \
//  [a]  [b]  [c]  [d]  [e]
//
//  start with 0-filled matrix:
//
//     | 1  2  3  4  5
//   --+-------------
//   a | 0  0  0  0  0
//   b | 0  0  0  0  0
//   c | 0  0  0  0  0
//   d | 0  0  0  0  0
//   e | 0  0  0  0  0
//
//  Edge 1->c is found: [1][c] is 0, no crossings, and 1 is added to all squares
//  with X>1 and Y<c:
//     | 1  2  3  4  5
//   --+-------------
//   a | 0  1  1  1  1
//   b | 0  1  1  1  1
//   c | 0  0  0  0  0
//   d | 0  0  0  0  0
//   e | 0  0  0  0  0
//  Edge 1->e is found: [1][e] is 0, no crossings, and 1 is added to all squares
//  with X>1 and Y<e:
//     | 1  2  3  4  5
//   --+-------------
//   a | 0  2  2  2  2
//   b | 0  2  2  2  2
//   c | 0  1  1  1  1
//   d | 0  1  1  1  1
//   e | 0  0  0  0  0
//  Edge 2->a is found: [2][a] is 2, 2 crossings total, and 1 is added to all squares
//  with X>2 and Y<a: no such squares
//  Edge 2->c is found: [2][c] is 1, 3 crossings total, and 1 is added to all squares
//  with X>2 and Y<c:
//     | 1  2  3  4  5
//   --+-------------
//   a | 0  2  3  3  3
//   b | 0  2  3  3  3
//   c | 0  1  1  1  1
//   d | 0  1  1  1  1
//   e | 0  0  0  0  0
//  Edge 3->d is found: [3][d] is 1, 4 crossings total, and 1 is added to all squares
//  with X>3 and Y<d:
//     | 1  2  3  4  5
//   --+-------------
//   a | 0  2  3  4  4
//   b | 0  2  3  4  4
//   c | 0  1  1  2  2
//   d | 0  1  1  1  1
//   e | 0  0  0  0  0
//  Edge 4->b is found: [4][b] is 4, 8 crossings total, and 1 is added to all squares
//  with X>4 and Y<b:
//     | 1  2  3  4  5
//   --+-------------
//   a | 0  2  3  4  5
//   b | 0  2  3  4  4
//   c | 0  1  1  2  2
//   d | 0  1  1  1  1
//   e | 0  0  0  0  0
//  Edge 4->d is found: [4][d] is 1, 9 crossings total, and 1 is added to all squares
//  with X>4 and Y<d:
//     | 1  2  3  4  5
//   --+-------------
//   a | 0  2  3  4  6
//   b | 0  2  3  4  5
//   c | 0  1  1  2  3
//   d | 0  1  1  1  1
//   e | 0  0  0  0  0
//  Edge 5->c is found: [5][c] is 3, 12 crossings total, and no more edges.

CrossEdgeMatrix = function(numRank1, numRank2) {
    this.numCrossings = 0;

    this.numRank1 = numRank1;
    this.numRank2 = numRank2;

    this.crossMatrix = [];
    for (var i = 0; i < numRank1; i++) {
        this.crossMatrix[i] = [];
        for (var j = 0; j < numRank2; j++) {
            this.crossMatrix[i][j] = 0;
        }
    }

}

Ext.extend(CrossEdgeMatrix, Object, {
    addEdge: function(orderRank1, orderRank2) {
        this.numCrossings += this.crossMatrix[orderRank1][orderRank2];

        for (var i = orderRank1+1; i<this.numRank1; i++) {
            for (var j = orderRank2-1; j >=0; j--) {
                this.crossMatrix[i][j]++;
            }
        }
    },

    getNumCrossings: function() {
        return this.numCrossings;
    }
});


    /*
    edge_crossing: function(order)
    {
        var numCrossings = 0;

        for (var r = 0; r < this.maxRank; r++) {
            // compute number of crossings from rank rFrom to rank rTo
            var numRank1 = order.order[r].length;
            var numRank2 = order.order[r+1].length;

            // init cross matrix
            var crossMatrix = new CrossEdgeMatrix(numRank1, numRank2);

            // go over all edges between r and r+1, from lower orders to higher,
            // filling the matrix & counting crossings
            var edgesBetweenRanks = this.GG.getAllEdgesBetweenRankAndBelow(r);

            var sortfunc = function(a,b) {
                return (order.vOrder[a[0]] - order.vOrder[b[0]]);
            };

            edgesBetweenRanks.sort(sortfunc);

            for (var i = 0; i < edgesBetweenRanks.length; i++) {
                var edge = edgesBetweenRanks[i];
                crossMatrix.addEdge(order.vOrder[edge[0]], order.vOrder[edge[1]]);
            }

            numCrossings += crossMatrix.getNumCrossings();
        }

        return numCrossings;
    },
    */
