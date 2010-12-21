var cocos = require('cocos2d'),
    event = require('event'),
    util  = require('util'),
    geo   = require('geometry'),
    Entity = require('./Entity').Entity,
    components = require('../components');

var Camera = Entity.extend(/** @lends coconut.entities.Camera# */{
    /**
     * Prevent camera from leaving edge of the world
     * @type Boolean
     */
    worldBound: true,

    /**
     * Entity for the camera to always focus on
     * @type coconut.entities.Entity
     */
    targetEntity: null,

    /**
     * Position offset when tracking an entity
     * @type geometry.Point
     */
    offset: null,

    /**
     * An invisible entity used to represent the camera location.
     * You can have multiple cameras in game and switch between them at will.
     *
     * @memberOf coconut.entities
     * @extends coconut.entities.Entity
     * @constructs
     */
    init: function() {
        @super;

        this.set('offset', geo.ccp(0, 0));

        // Camera is always the size of the entire view
        var d = cocos.Director.get('sharedDirector');
        this.bindTo('contentSize', d, 'winSize');


        this.scheduleUpdate();
    },

    get_rect: function() {
        var p = this.get('position'),
            s = this.get('contentSize'),
            a = this.get('anchorPointInPixels');
        return geo.rectMake(p.x - a.x, p.y - a.y, s.width, s.height);
    },

    update: function(dt) {
        var e = this.get('targetEntity'),
            pos = geo.ccpAdd(geo.ccpAdd(e.get('position'), e.get('anchorPointInPixels')), this.get('offset'));



        // Test if moved outside of world bounds
        if (this.get('worldBound')) {
            pos = this.fitToWorld(pos);
        }

        this.set('position', pos);
    },

    fitToWorld: function(pos) {
        pos = geo.ccp(pos.x, pos.y);

        var world = this.get('world');
        if (!world) {
            return pos;
        }
        var anchor = this.get('anchorPointInPixels'),
            worldRect = world.get('boundingBox'),
            size = this.get('contentSize'),
            winSize = cocos.Director.get('sharedDirector').get('winSize');

        if (pos.x - anchor.x < worldRect.origin.x) {
            pos.x = worldRect.origin.x + anchor.x;
        } else if (pos.x - anchor.x + size.width > worldRect.origin.x + worldRect.size.width) {
            pos.x = worldRect.origin.x + worldRect.size.width - size.width + anchor.x;
        }
        if (pos.y - anchor.y < worldRect.origin.y) {
            pos.y = worldRect.origin.y + anchor.y;
        } else if (pos.y - anchor.y + size.height > worldRect.origin.y + worldRect.size.height) {
            pos.y = worldRect.origin.y + worldRect.size.height - size.height + anchor.y;
        }

        return pos;
    },

    get_boundingBox: function() {
        var rect = @super;
        rect.origin = geo.ccpAdd(rect.origin, this.get('offset'));

        return rect;
    }

});

var OffsetTo = cocos.actions.ActionInterval.extend({
    dstOffset: null,
    startOffset: null,
    diffOffset: null,

    init: function(opts) {
        @super;

        this.set('dstOffset', util.copy(opts.offset));
    },

    startWithTarget: function(target) {
        @super;

        this.set('startOffset', util.copy(target.get('offset')));
        this.set('diffOffset', geo.ccpSub(this.get('dstOffset'), this.get('startOffset')));
    },

    update: function(t) {
        var start = this.get('startOffset'),
            diff  = this.get('diffOffset');
        this.target.set('offset', geo.ccp(start.x + diff.x * t, start.y + diff.y * t));
    }
});

var OffsetAxisTo = cocos.actions.ActionInterval.extend({
    dstOffset: null,
    startOffset: null,
    diffOffset: null,
    axis: null,

    init: function(opts) {
        @super;

        this.set('dstOffset', util.copy(opts.offset));
        this.set('axis', opts.axis);
    },

    startWithTarget: function(target) {
        @super;

        this.set('startOffset', target.get('offset')[this.axis]);
        this.set('diffOffset', this.get('dstOffset') - this.get('startOffset'));
    },

    update: function(t) {
        var start = this.get('startOffset'),
            diff  = this.get('diffOffset'),
            offset = this.get('target').get('offset');

        if (this.axis == 'x') {
            this.target.set('offset', geo.ccp(start + diff * t, offset.y));
        } else {
            this.target.set('offset', geo.ccp(offset.x, start + diff * t));
        }
    }
});



var PlayerCamera = Camera.extend(/** @lends coconut.entities.PlayerCamera# */{
    trackDirection: 0,
    entityOffset: 32,
    moveTolerance: 64,

    /**
     * Similar to a normal camera but will adjust itself to an optimal position
     * for a 2D side scroller
     * @extends coconut.entities.Camera
     * @constructs
     */
    init: function(opts) {
        @super;
        
        this.set('trackDirection', PlayerCamera.TRACK_NONE);
    },

    update: function() {
        var entity = this.get('targetEntity'),
            entityBox = entity.get('boundingBox'),  // Rectangle around the entity
            entityBoxRel = util.copy(entityBox),
            cameraBox = this.get('boundingBox'),    // The camera view area
            entityPrevPosition = this.entityPrevPosition_ || util.copy(entityBox.origin),  // Where the entity was previous frame
            vector = geo.ccpSub(entityBox.origin, entityPrevPosition),      // How the entity moved since last frame
            trackDirection = this.get('trackDirection'),
            entityOffset = this.get('entityOffset'),
            moveTolerance = this.get('moveTolerance'),
            offset = this.get('offset'),
            newOffset = util.copy(offset);


        // Adjust entityBox origin so it's relative to the camera
        entityBoxRel.origin = geo.ccpSub(entityBoxRel.origin, cameraBox.origin);

        // Where the camera will move to
        var newPosition = util.copy(entityBox.origin);

        // Update entity's previous position so we can calculate the vector next frame
        this.entityPrevPosition_ = util.copy(entityBox.origin);

        // Readjust horizontal camera position when moveing around
        if (vector.x != 0) {
            // Walking in opposite direction of tracking and hit moveTolerance so readjust camera track new direction
            if ((entityBoxRel.origin.x + entityBoxRel.size.width > (cameraBox.size.width/2) + moveTolerance && trackDirection != PlayerCamera.TRACK_RIGHT) ||
            (entityBoxRel.origin.x < (cameraBox.size.width/2) - moveTolerance && trackDirection != PlayerCamera.TRACK_LEFT)) {
                // Swap directions
                trackDirection = (vector.x > 0) ? PlayerCamera.TRACK_RIGHT : PlayerCamera.TRACK_LEFT;
                this.set('trackDirection', trackDirection);

                var dstOffset = trackDirection * entityOffset;
                if (trackDirection == PlayerCamera.TRACK_RIGHT) {
                    dstOffset += entityBoxRel.size.width;
                }

                if (this.offsetXAction_) {
                    cocos.ActionManager.get('sharedManager').removeAction(this.offsetXAction_);
                    delete this.offsetXAction_;
                }
                this.offsetXAction_ = OffsetAxisTo.create({duration: 0.7, offset: dstOffset, axis: 'x'});
                this.runAction(this.offsetXAction_);
            }
            
            // Walking in direction opposite to tracking
            else if ((vector.x > 0 && trackDirection != PlayerCamera.TRACK_RIGHT) || (vector.x < 0 && trackDirection != PlayerCamera.TRACK_LEFT)) {
                if (this.offsetXAction_) {
                    cocos.ActionManager.get('sharedManager').removeAction(this.offsetXAction_);
                    delete this.offsetXAction_;
                }
                newOffset = geo.ccp(offset.x - vector.x, offset.y);
            }
        }

        if (this.get('worldBound')) {
            // Adjust offset to fit inside world
            var offsetPos = geo.ccpAdd(newPosition, newOffset);
            var outside = geo.ccpSub(this.fitToWorld(offsetPos), offsetPos);
            newOffset = geo.ccpAdd(newOffset, outside);
        }

        this.set('offset', newOffset);
        this.set('position', newPosition);
    }
});

PlayerCamera.TRACK_LEFT  = -1;
PlayerCamera.TRACK_NONE  = 0;
PlayerCamera.TRACK_RIGHT = 1;

exports.Camera = Camera;
exports.PlayerCamera = PlayerCamera;
