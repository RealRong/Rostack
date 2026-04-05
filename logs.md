[wb-debug:pointer] down:resolved 

{
    "pick": {
        "kind": "node",
        "id": "node-1",
        "part": "body"
    },
    "field": "text",
    "editable": false,
    "ignoreInput": false,
    "ignoreSelection": false,
    "ignoreContextMenu": false,
    "client": {
        "x": 271.80078125,
        "y": 330.8203125
    },
    "screen": {
        "x": 271.80078125,
        "y": 330.8203125
    },
    "world": {
        "x": -112.19921875,
        "y": -63.1796875
    },
    "viewport": {
        "center": {
            "x": 0,
            "y": 0
        },
        "zoom": 1
    },
    "eventTarget": {
        "tag": "div",
        "className": "wb-shape-node-label",
        "nodeId": null,
        "nodeType": null,
        "nodeHit": null,
        "selectionIgnore": false,
        "inputIgnore": false,
        "contextMenuIgnore": false,
        "editableField": "text"
    },
    "topElement": {
        "tag": "div",
        "className": "wb-shape-node-label",
        "nodeId": null,
        "nodeType": null,
        "nodeHit": null,
        "selectionIgnore": false,
        "inputIgnore": false,
        "contextMenuIgnore": false,
        "editableField": "text"
    }
}

[wb-debug:selection] press:resolved 
{
    "targetInput": {
        "kind": "node",
        "nodeId": "node-1",
        "part": "body",
        "field": "text"
    },
    "target": {
        "kind": "node",
        "nodeId": "group-1",
        "hitNodeId": "node-1"
    },
    "decision": {
        "chrome": false,
        "tap": {
            "kind": "select",
            "target": {
                "nodeIds": [
                    "group-1"
                ],
                "edgeIds": []
            }
        },
        "drag": {
            "kind": "move",
            "target": {
                "nodeIds": [
                    "group-1"
                ],
                "edgeIds": []
            },
            "selection": {
                "kind": "temporary",
                "visibleSelection": {
                    "nodeIds": [
                        "group-1"
                    ],
                    "edgeIds": []
                },
                "restoreSelection": {
                    "nodeIds": [],
                    "edgeIds": []
                }
            }
        },
        "hold": {
            "kind": "marquee",
            "match": "contain",
            "mode": "replace",
            "base": {
                "nodeIds": [],
                "edgeIds": []
            },
            "clearOnStart": true
        }
    }
}

[wb-debug:pointer] down:editor-result 

{
    "handled": true,
    "continuePointer": true,
    "interaction": {
        "busy": true,
        "chrome": false,
        "transforming": false,
        "drawing": false,
        "panning": false,
        "selecting": true,
        "editingEdge": false,
        "space": false
    }
}