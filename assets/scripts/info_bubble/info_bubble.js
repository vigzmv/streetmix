import { app } from '../preinit/app_settings'
import { system } from '../preinit/system_capabilities'
import { hideDescription } from './description'
import {
  createBuildings,
  onBuildingMouseEnter,
  updateBuildingPosition
} from '../segments/buildings'
import { DRAGGING_TYPE_NONE, draggingType } from '../segments/drag_and_drop'
import { cancelFadeoutControls } from '../segments/resizing'
import { getElAbsolutePos } from '../util/helpers'
import { registerKeypress } from '../app/keypress'
import {
  switchSegmentElIn,
  switchSegmentElAway
} from '../segments/view'
import { getStreet, saveStreetToServerIfNecessary } from '../streets/data_model'
import store from '../store'
import {
  showInfoBubble,
  hideInfoBubble,
  setInfoBubbleSegmentDataNo,
  updateHoverPolygon
} from '../store/actions/infoBubble'

export const INFO_BUBBLE_TYPE_SEGMENT = 1
export const INFO_BUBBLE_TYPE_LEFT_BUILDING = 2
export const INFO_BUBBLE_TYPE_RIGHT_BUILDING = 3

const INFO_BUBBLE_MARGIN_BUBBLE = 20
const INFO_BUBBLE_MARGIN_MOUSE = 10

const MIN_TOP_MARGIN_FROM_VIEWPORT = 120

function isInfoBubbleVisible () {
  return store.getState().infoBubble.visible
}

export const infoBubble = {
  el: null,

  descriptionVisible: false,

  startMouseX: null,
  startMouseY: null,
  hoverPolygon: null,
  segmentEl: null,
  segment: null,
  type: null,

  lastMouseX: null,
  lastMouseY: null,

  suppressed: false,

  bubbleX: null,
  bubbleY: null,
  bubbleWidth: null,
  bubbleHeight: null,

  considerMouseX: null,
  considerMouseY: null,
  considerSegmentEl: null,
  considerType: null,

  hoverPolygonUpdateTimerId: -1,
  suppressTimerId: -1,

  registerKeypresses: function () {
    // Register keyboard shortcuts to hide info bubble
    // Only hide if it's currently visible, and if the
    // description is NOT visible. (If the description
    // is visible, the escape key should hide that first.)
    registerKeypress('esc', {
      condition: function () { return isInfoBubbleVisible() && !infoBubble.descriptionVisible }
    }, function () {
      infoBubble.hide()
      infoBubble.hideSegment(false)
    })
  },
  suppress: function () {
    if (!infoBubble.suppressed) {
      infoBubble.hide()
      infoBubble.hideSegment(true)
      infoBubble.suppressed = true
    }

    window.clearTimeout(infoBubble.suppressTimerId)
    infoBubble.suppressTimerId = window.setTimeout(infoBubble.unsuppress, 100)
  },

  unsuppress: function () {
    infoBubble.suppressed = false

    window.clearTimeout(infoBubble.suppressTimerId)
  },

  _withinHoverPolygon: function (x, y) {
    const hoverPolygon = store.getState().infoBubble.hoverPolygon
    return _isPointInPoly(hoverPolygon, [x, y])
  },

  // TODO: make this a pure(r) function
  createHoverPolygon: function (mouseX, mouseY) {
    let hoverPolygon = []

    if (!isInfoBubbleVisible()) {
      return hoverPolygon
    }

    const bubbleX = infoBubble.bubbleX
    const bubbleY = infoBubble.bubbleY
    const bubbleWidth = infoBubble.bubbleWidth
    const bubbleHeight = infoBubble.bubbleHeight

    let marginBubble

    if (infoBubble.descriptionVisible) {
      // TODO const
      marginBubble = 200
    } else {
      marginBubble = INFO_BUBBLE_MARGIN_BUBBLE
    }

    const mouseInside = store.getState().infoBubble.mouseInside
    if (mouseInside && !infoBubble.descriptionVisible) {
      var pos = getElAbsolutePos(infoBubble.segmentEl)

      var x = pos[0] - document.querySelector('#street-section-outer').scrollLeft

      var segmentX1 = x - INFO_BUBBLE_MARGIN_BUBBLE
      var segmentX2 = x + infoBubble.segmentEl.offsetWidth + INFO_BUBBLE_MARGIN_BUBBLE

      var segmentY = pos[1] + infoBubble.segmentEl.offsetHeight + INFO_BUBBLE_MARGIN_BUBBLE

      hoverPolygon = [
        [bubbleX - marginBubble, bubbleY - marginBubble],
        [bubbleX - marginBubble, bubbleY + bubbleHeight + marginBubble],
        [segmentX1, bubbleY + bubbleHeight + marginBubble + 120],
        [segmentX1, segmentY],
        [segmentX2, segmentY],
        [segmentX2, bubbleY + bubbleHeight + marginBubble + 120],
        [bubbleX + bubbleWidth + marginBubble, bubbleY + bubbleHeight + marginBubble],
        [bubbleX + bubbleWidth + marginBubble, bubbleY - marginBubble],
        [bubbleX - marginBubble, bubbleY - marginBubble]
      ]
    } else {
      var bottomY = mouseY - INFO_BUBBLE_MARGIN_MOUSE
      if (bottomY < bubbleY + bubbleHeight + INFO_BUBBLE_MARGIN_BUBBLE) {
        bottomY = bubbleY + bubbleHeight + INFO_BUBBLE_MARGIN_BUBBLE
      }
      var bottomY2 = mouseY + INFO_BUBBLE_MARGIN_MOUSE
      if (bottomY2 < bubbleY + bubbleHeight + INFO_BUBBLE_MARGIN_BUBBLE) {
        bottomY2 = bubbleY + bubbleHeight + INFO_BUBBLE_MARGIN_BUBBLE
      }

      if (infoBubble.descriptionVisible) {
        bottomY = bubbleY + bubbleHeight + marginBubble
        bottomY2 = bottomY
      }

      var diffX = 60 - ((mouseY - bubbleY) / 5)
      if (diffX < 0) {
        diffX = 0
      } else if (diffX > 50) {
        diffX = 50
      }

      hoverPolygon = [
        [bubbleX - marginBubble, bubbleY - marginBubble],
        [bubbleX - marginBubble, bubbleY + bubbleHeight + marginBubble],
        [(bubbleX - marginBubble + mouseX - INFO_BUBBLE_MARGIN_MOUSE - diffX) / 2, bottomY + ((bubbleY + bubbleHeight + marginBubble - bottomY) * 0.2)],
        [mouseX - INFO_BUBBLE_MARGIN_MOUSE - diffX, bottomY],
        [mouseX - INFO_BUBBLE_MARGIN_MOUSE, bottomY2],
        [mouseX + INFO_BUBBLE_MARGIN_MOUSE, bottomY2],
        [mouseX + INFO_BUBBLE_MARGIN_MOUSE + diffX, bottomY],
        [(bubbleX + bubbleWidth + marginBubble + mouseX + INFO_BUBBLE_MARGIN_MOUSE + diffX) / 2, bottomY + ((bubbleY + bubbleHeight + marginBubble - bottomY) * 0.2)],
        [bubbleX + bubbleWidth + marginBubble, bubbleY + bubbleHeight + marginBubble],
        [bubbleX + bubbleWidth + marginBubble, bubbleY - marginBubble],
        [bubbleX - marginBubble, bubbleY - marginBubble]
      ]
    }

    return hoverPolygon
  },

  updateHoverPolygon: function (mouseX, mouseY) {
    const hoverPolygon = infoBubble.createHoverPolygon(mouseX, mouseY)
    store.dispatch(updateHoverPolygon(hoverPolygon))
  },

  scheduleHoverPolygonUpdate: function () {
    window.clearTimeout(infoBubble.hoverPolygonUpdateTimerId)

    infoBubble.hoverPolygonUpdateTimerId = window.setTimeout(function () {
      infoBubble.updateHoverPolygon(infoBubble.lastMouseX, infoBubble.lastMouseY)
    }, 50)
  },

  onBodyMouseMove: function (event) {
    var mouseX = event.pageX
    var mouseY = event.pageY

    infoBubble.lastMouseX = mouseX
    infoBubble.lastMouseY = mouseY

    if (isInfoBubbleVisible()) {
      if (!infoBubble._withinHoverPolygon(mouseX, mouseY)) {
        infoBubble.show(false)
      }
    }

    infoBubble.scheduleHoverPolygonUpdate()
  },

  hideSegment: function (fast) {
    if (infoBubble.segmentEl) {
      infoBubble.segmentEl.classList.remove('hover')
      var el = infoBubble.segmentEl
      if (fast) {
        el.classList.add('immediate-show-drag-handles')
        window.setTimeout(function () {
          el.classList.remove('immediate-show-drag-handles')
        }, 0)
      } else {
        el.classList.remove('immediate-show-drag-handles')
      }
      infoBubble.segmentEl.classList.remove('hide-drag-handles-when-description-shown')
      infoBubble.segmentEl.classList.remove('hide-drag-handles-when-inside-info-bubble')
      infoBubble.segmentEl.classList.remove('show-drag-handles')
      infoBubble.segmentEl = null
      infoBubble.segment = null
    }
  },

  hide: function () {
    if (infoBubble.el) {
      hideDescription()
      document.body.classList.remove('controls-fade-out')

      store.dispatch(hideInfoBubble())

      document.body.removeEventListener('mousemove', infoBubble.onBodyMouseMove)
    }
  },

  considerShowing: function (event, segmentEl, type) {
    if (Boolean(store.getState().menus.activeMenu) === true || app.readOnly) {
      return
    }

    if (event) {
      infoBubble.considerMouseX = event.pageX
      infoBubble.considerMouseY = event.pageY
    } else {
      var pos = getElAbsolutePos(segmentEl)

      infoBubble.considerMouseX = pos[0] - document.querySelector('#street-section-outer').scrollLeft
      infoBubble.considerMouseY = pos[1]
    }
    infoBubble.considerSegmentEl = segmentEl
    infoBubble.considerType = type

    if ((segmentEl === infoBubble.segmentEl) && (type === infoBubble.type)) {
      return
    }

    if (!isInfoBubbleVisible() || !infoBubble._withinHoverPolygon(infoBubble.considerMouseX, infoBubble.considerMouseY)) {
      infoBubble.show(false)
    }
  },

  dontConsiderShowing: function () {
    infoBubble.considerSegmentEl = null
    infoBubble.considerType = null
  },

  onBuildingVariantButtonClick: function (side) {
    const street = store.getState().street
    const street2 = getStreet()

    if (side === 'left') {
      street2.leftBuildingVariant = street.leftBuildingVariant
    } else {
      street2.rightBuildingVariant = street.rightBuildingVariant
    }

    var el = document.querySelector('#street-section-' + side + '-building')
    el.id = 'street-section-' + side + '-building-old'

    var newEl = document.createElement('div')
    newEl.className = 'street-section-building'
    newEl.id = 'street-section-' + side + '-building'

    el.parentNode.appendChild(newEl)
    updateBuildingPosition()
    switchSegmentElIn(newEl)
    switchSegmentElAway(el)

    // TODO repeat
    newEl.addEventListener('pointerenter', onBuildingMouseEnter)
    newEl.addEventListener('pointerleave', onBuildingMouseEnter)

    saveStreetToServerIfNecessary()
    createBuildings()

    infoBubble.updateContents()
  },

  updateContents: function () {
    let street = getStreet()

    // If info bubble changes, wake this back up if it's fading out
    cancelFadeoutControls()

    window.dispatchEvent(new window.CustomEvent('stmx:force_infobubble_update'))

    switch (infoBubble.type) {
      case INFO_BUBBLE_TYPE_SEGMENT:
        var segment = street.segments[store.getState().infoBubble.dataNo]
        infoBubble.segment = segment
        break
    }
  },

  // TODO rename
  show: function (force) {
    if (infoBubble.suppressed) {
      window.setTimeout(infoBubble.show, 100)
      return
    }

    if (draggingType() !== DRAGGING_TYPE_NONE) {
      return
    }

    if (!infoBubble.considerType) {
      infoBubble.hide()
      infoBubble.hideSegment(false)
      return
    }

    var segmentEl = infoBubble.considerSegmentEl
    var type = infoBubble.considerType

    if ((segmentEl === infoBubble.segmentEl) &&
      (type === infoBubble.type) && !force) {
      return
    }
    infoBubble.hideSegment(true)

    var mouseX = infoBubble.considerMouseX
    var mouseY = infoBubble.considerMouseY

    infoBubble.segmentEl = segmentEl
    infoBubble.type = type

    if (segmentEl) {
      segmentEl.classList.add('hover')
      segmentEl.classList.add('show-drag-handles')
    }
    if (isInfoBubbleVisible()) {
      segmentEl.classList.add('immediate-show-drag-handles')

      if (infoBubble.descriptionVisible) {
        hideDescription()
      }
    }

    infoBubble.startMouseX = mouseX
    infoBubble.startMouseY = mouseY

    var pos = getElAbsolutePos(segmentEl)
    var bubbleX = pos[0] - document.querySelector('#street-section-outer').scrollLeft
    var bubbleY = pos[1]

    const dataNo = segmentEl.dataNo
    store.dispatch(setInfoBubbleSegmentDataNo(dataNo))

    infoBubble.el = document.querySelector('.info-bubble')
    infoBubble.updateContents()

    var bubbleWidth = infoBubble.el.offsetWidth
    var bubbleHeight = infoBubble.el.offsetHeight

    // TODO const
    bubbleY -= bubbleHeight - 20
    if (bubbleY < MIN_TOP_MARGIN_FROM_VIEWPORT) {
      bubbleY = MIN_TOP_MARGIN_FROM_VIEWPORT
    }

    bubbleX += segmentEl.offsetWidth / 2
    bubbleX -= bubbleWidth / 2

    // TODO const
    if (bubbleX < 50) {
      bubbleX = 50
    } else if (bubbleX > system.viewportWidth - bubbleWidth - 50) {
      bubbleX = system.viewportWidth - bubbleWidth - 50
    }

    infoBubble.el.style.left = bubbleX + 'px'
    infoBubble.el.style.top = bubbleY + 'px'

    if (!isInfoBubbleVisible()) {
      store.dispatch(showInfoBubble())
    }

    infoBubble.bubbleX = bubbleX
    infoBubble.bubbleY = bubbleY
    infoBubble.bubbleWidth = bubbleWidth
    infoBubble.bubbleHeight = bubbleHeight

    infoBubble.updateHoverPolygon(mouseX, mouseY)
    document.body.addEventListener('mousemove', infoBubble.onBodyMouseMove)
  }
}

function _isPointInPoly (vs, point) {
  var x = point[0]
  var y = point[1]

  var inside = false
  for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    var xi = vs[i][0]
    var yi = vs[i][1]
    var xj = vs[j][0]
    var yj = vs[j][1]

    var intersect = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi) / (yj - yi)) + xi)
    if (intersect) inside = !inside
  }

  return inside
}
