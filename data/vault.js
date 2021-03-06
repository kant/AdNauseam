/*jslint browser: true*/

/*global
    gAds: true, gAdSets: true, self, imagesLoaded, createSlider,
    warn, targetDomain, alert, rand, error, Type, AdSet, byField,
    showAlert, Packery, computeHashKey, toAdArray, log,
    TEXT_MINW, TEXT_MAXW, TEST_APPEND_IDS, TEST_ADS, TEST_MODE, TEST_PAGE
*/

const LogoURL = 'http://dhowe.github.io/AdNauseam/',
  States = ['pending', 'visited', 'failed'],
  Zooms = [100, 50, 25, 12.5, 6.25],
  EnableContextMenu = 1,
  MaxPerSet = 9;

var zoomStyle, zoomIdx = 0,
  animatorId, animateMs = 2000,
  resizeId, selectedAdSet, viewState = {};

var locale = self.options && self.options.locale; // localization

if (!locale && typeof TEST_MODE != 'undefined' && TEST_MODE)
  doFakeLocale();

self.port && self.port.on('layout-ads', layoutAds); // refresh all
self.port && self.port.on('update-ad', updateAd); // update some
self.port && self.port.on('set-current', setCurrent); // ad attempt

/* createSlider -> runFilter -> doLayout */

function layoutAds(json) {

  gAds = json.data; // store

  addInterfaceHandlers();

  createSlider(true);

  setCurrent(json);
}

function updateAd(json) {

  doUpdate(json.update);

  setAttempting(json.current);

  computeStats(gAdSets);
}

function setAttempting(current) {

  if (!current) return;

  var groupInfo = findAdById(current.id),
    $item;

  if (groupInfo) {

    $item = findItemDivByGid(groupInfo.group.gid);

    // update the class for ad being attempted
    $item && $item.addClass('attempting');
  }
}

function setCurrent(json) {

  //log('vault::setCurrent: '+(json.current?json.current.id:-1));

  $('.item').removeClass('attempting just-visited just-failed');

  setAttempting(json.current);
}

function doLayout(adsets) {

  //log('Vault.doLayout: '+adsets.length +" ad-sets, total="+numFound(adsets));

  adsets = adsets || [];

  $('.item').remove();

  createDivs(adsets);

  computeStats(adsets);

  enableLightbox();

  repack();
}

function createDivs(adsets) {

  function hoverOnDiv(e) { // on

    var $this = $(this);

    if ($this.hasClass('inspected')) {

      // pause animation on mouse-over image
      var inspectedGid = parseInt($this.attr('data-gid'));
      selectedAdSet = findAdSetByGid(inspectedGid); // throws
      bulletIndex($this, selectedAdSet);
      animateInspector(false);
    }

    e.stopPropagation();
  }

  function hoverOffDiv(e) { // off

    if ($(this).hasClass('inspected')) {

      animateInspector($(this));
    }
  }

  for (var i = 0; i < adsets.length; i++) {

    var $div = $('<div/>', {

      'class': 'item dup-count-' + adsets[i].count(),
      'data-gid': adsets[i].gid

    }).appendTo('#container');

    layoutAd($div, adsets[i]);

    $div.hover(hoverOnDiv, hoverOffDiv);
  }
}

function layoutAd($div, adset) {

  // append the display
  (adset.child(0).contentType === 'text' ?
    appendTextDisplayTo : appendDisplayTo)($div, adset);

  setItemClass($div, adset.groupState());
}

function doUpdate(updated) {

  var groupInfo = findAdById(updated.id),
    adset, itemClass, $item;

  if (groupInfo) {

    adset = groupInfo.group;
    $item = findItemDivByGid(groupInfo.group.gid);

    // update the adgroup
    adset.index = groupInfo.index;
    adset.children[adset.index] = updated;
  }

  if (!$item) {

    log("Item (adset=" + adset.gid + ") not currently visible");
    return;
  }

  $('.item').removeClass('attempting just-visited just-failed');

  // update the ad data
  updateMetaTarget($item.find('.target[data-idx=' + adset.index + ']'), updated);

  // update the class
  $item.addClass(updated.visitedTs > 0 ? 'just-visited' : 'just-failed');

  setItemClass($item, adset.groupState());

  (adset.count() > 1) && bulletIndex($item, adset);
}

function setItemClass($item, state) {

  States.map(function(d) {
    $item.removeClass(d);
  }); // remove-all

  $item.addClass(state);
}

function appendMetaTo($div, adset) {

  //log('appendMetaTo:' + adset.gid);
  var $meta = $('<div/>', {
    class: 'meta'
  }).appendTo($div);

  var $ul = $('<ul/>', {

    class: 'meta-list',
    style: 'margin-top: 0px'

  }).appendTo($meta);

  for (var i = 0; i < adset.count(); i++) {

    var ad = adset.child(i);

    var $li = $('<li/>', {

      'class': 'meta-item',
      'style': 'margin-top: 0px'

    }).appendTo($ul);

    var $target = $('<div/>', {

      class: 'target',
      'data-idx': i

    }).appendTo($li);

    appendTargetTo($target, ad, adset); // tmp, remove adset

    var $detected = $('<div/>', {
      class: 'detected-on'
    }).appendTo($li);

    appendDetectedTo($detected, ad);
  }
}

function appendDetectedTo($detected, ad) {

  $('<h3/>', {
    text: locale.foundOn + ":"
  }).appendTo($detected);

  $('<a/>', {
    class: 'inspected-title',
    href: ad.pageUrl,
    text: ad.pageTitle,
    target: '_blank'

  }).appendTo($detected);

  $('<cite/>', {
    text: ad.pageUrl
  }).appendTo($detected);

  $('<span/>', {

    class: 'inspected-date',
    text: formatDate(ad.foundTs)

  }).appendTo($detected);
}

function appendTargetTo($target, ad, adset) {

  $('<h3/>', {
    text: locale.target + ":"
  }).appendTo($target);

  //log("Creating target #"+ad.id+" title="+ad.title);
  $('<a/>', {

    id: 'target-title',
    class: 'inspected-title',
    href: ad.targetUrl,
    text: ad.title,
    target: '_blank'

  }).appendTo($target);

  $('<cite/>', {

    id: 'target-domain',
    class: 'target-cite',
    text: targetDomain(ad)

  }).appendTo($target);

  $('<span/>', {

    id: 'target-date',
    class: 'inspected-date',
    text: formatDate(ad.visitedTs)

  }).appendTo($target);
}

function updateMetaTarget($target, ad) {

  $target.find('#target-domain').text(targetDomain(ad));
  $target.find('#target-date').text(formatDate(ad.visitedTs));
  var $titleA = $target.find('#target-title').text(ad.title);
  if (ad.resolvedTargetUrl)
    $titleA.attr('href', ad.resolvedTargetUrl);
}

/**
 * Resets current bullet class to [active,ad.state]
 * Shifts meta list to show correct item
 * Updates index-counter for the bullet
 */
function bulletIndex($div, adset) { // adset.index must be updated first

  var $bullet = $div.find('.bullet[data-idx=' + (adset.index) + ']'),
    state = adset.state(),
    $ul;

  //log('bulletIndex: c["+adset.index+"]="+adset.child().id+"-> "+ adset.state());

  // set the state for the bullet
  setItemClass($bullet, state);

  // set the active class for bullet
  $bullet.addClass('active')
    .siblings().removeClass('active');

  // shift the meta-list to show correct info
  $ul = $div.find('.meta-list');
  $ul.css('margin-top', (adset.index * -110) + 'px');

  // update the counter bubble
  $div.find('#index-counter').text(indexCounterText(adset));

  if ($div.hasClass('inspected')) {

    // (temporarily) add the state-class to the div
    setItemClass($div, state);
  }
}

function appendDisplayTo($div, adset) {

  var $ad = $('<div/>', { class: 'ad' }).appendTo($div);

  $('<span/>', {

    class: 'counter',
    text: adset.count()

  }).appendTo($ad);

  $('<span/>', {

    id: 'index-counter',
    class: 'counter counter-index',
    text: indexCounterText(adset)

  }).appendTo($ad).hide();

  var $img = $('<img/>', {

    src: adset.child(0).contentData.src,

    onerror: "this.onerror=null; this.width=80; this.height=40; " +
      "this.alt='unable to load image'; this.src='img/placeholder.svg'",

  }).appendTo($ad);

  // fix for #291
  $img.load(function() {

    // cache the dimensions of the img-item AFTER load
    var $this = $(this);
    $div.attr('data-width', $this.width());
    $div.attr('data-height', $this.height());
  });
}

function appendTextDisplayTo($pdiv, adset) {

  var total = adset.count(),
    ad = adset.child(0);

  $pdiv.addClass('item-text');

  var $div = $('<div/>', {

    class: 'item-text-div',
    width: rand(TEXT_MINW, TEXT_MAXW)

  }).appendTo($pdiv);

  $('<span/>', {

    class: 'counter',
    text: total

  }).appendTo($div);

  $('<span/>', {

    id: 'index-counter',
    class: 'counter counter-index',
    text: indexCounterText(adset)

  }).appendTo($div).hide();

  var $h3 = $('<h3/>', {}).appendTo($div);

  $('<div/>', { // title

    class: 'title',
    text: ad.title,
    target: '_blank'

  }).appendTo($h3);

  $('<cite/>', {
    text: ad.contentData.site
  }).appendTo($div); // site

  $('<div/>', { // text

    class: 'ads-creative',
    text: ad.contentData.text

  }).appendTo($div);

  // cache the dimensions of the text-item
  $pdiv.attr('data-width', $div.width());
  $pdiv.attr('data-height', $div.height());
}

function indexCounterText(adset) {

  return (adset.index + 1) + '/' + adset.count();
}

function appendBulletsTo($div, adset) {

  //log('appendBulletsTo: ' + adset.gid);

  function hoverOnLi(e) { // on

    e.stopPropagation();

    adset.index = parseInt($(this).attr('data-idx'));
    bulletIndex($div, adset);

    animateInspector(false);
  }

  function hoverOffLi(e) { // off

    animateInspector($div);
  }

  var count = adset.count();

  if (count > 1) {

    var $bullets = $('<div/>', { class: 'bullets' }).appendTo($div);

    // find the height of the image for bullet layout (#291)
    var adHeight = $div.attr('data-height');

    //log($div.find('img').height(), '?=', adHeight);

    var $ul = $('<ul/>', { height: adHeight }).appendTo($bullets);

    // add items based on count/state
    for (var i = 0; i < adset.count(); i++) {

      var $li = $('<li/>', {

        'data-idx': i,
        'class': 'bullet ' + adset.state(i)

      }).appendTo($ul);

      $li.hover(hoverOnLi, hoverOffLi);
    }
  }

  appendMetaTo($div, adset)
}

function computeStats(adsets) {

  $('.since').text(sinceTime(adsets));
  $('#clicked').text(numVisited(adsets));
  $('#detected').text(numFound(adsets));
}

function numVisited(adsets) {

  var numv = 0;

  for (var i = 0, j = adsets && adsets.length; i < j; i++)
    numv += (adsets[i].visitedCount());

  return numv;
}

function numFound(adsets) {

  var numv = 0;

  for (var i = 0, j = adsets && adsets.length; i < j; i++)
    numv += (adsets[i].count());

  return numv;
}

function sinceTime(adsets) {

  var idx = 0,
    oldest = +new Date();

  for (var i = 0, j = adsets && adsets.length; i < j; i++) {

    var foundTs = adsets[i].child(0).foundTs;
    if (foundTs < oldest) {

      oldest = foundTs;
      idx = i;
    }
  }

  return formatDate(oldest);
}

function dragStart(e) {

  var x = parseInt($(this).css("margin-left"), 10) - e.originalEvent.clientX,
    y = parseInt($(this).css("margin-top"), 10) - e.originalEvent.clientY;

  e.originalEvent.dataTransfer.setData("text/plain", x + ',' + y);

  $(this).addClass('dragged');
}

function dragOver(e) {

  var offset = e.originalEvent.dataTransfer.getData("text/plain").split(',');

  $(this).css("marginLeft", e.originalEvent.clientX + parseInt(offset[0], 10));
  $(this).css("marginTop", e.originalEvent.clientY + parseInt(offset[1], 10));
}

function dragEnd() {

  $(this).removeClass('dragged');
}

function formatDate(ts) {

  if (!ts) return locale.notYetVisited;

  var date = new Date(Math.abs(ts)),
    days = [locale.sun, locale.mon,
      locale.tue, locale.wed, locale.thu, locale.fri, locale.sat
    ],
    months = [locale.jan, locale.feb, locale.mar, locale.apr, locale.may,
      locale.jun, locale.jul, locale.aug, locale.sep, locale.oct,
      locale.nov, locale.dec
    ];

  var pad = function(str) {
    var s = String(str);
    return (s.length < 2) ? "0" + s : s;
  };

  var meridian = (parseInt(date.getHours() / 12) == 1) ? locale.pm : locale.am;
  var hours = date.getHours() > 12 ? date.getHours() - 12 : date.getHours();
  return days[date.getDay()] + ', ' + months[date.getMonth()] + ' ' + date.getDate() +
    ' ' + date.getFullYear() + ' ' + hours + ':' + pad(date.getMinutes()) +
    meridian.toLowerCase();
}


function enableLightbox() {

  $('.item').click(function(e) {

    e.stopPropagation();
    lightboxMode($(this));
  });

  if (EnableContextMenu) {

    $('.item').bind("contextmenu", function(e) {

      var $this = $(this);

      if (!$this.hasClass('inspected')) {

        // show normal ff-context menu in inspector for now
        e.stopPropagation();
        e.preventDefault();

        var inspectedGid = parseInt($this.attr('data-gid'));
        selectedAdSet = findAdSetByGid(inspectedGid); // throws

        // show custom contextmenu
        $(".custom-menu").finish().toggle(100).

        // in correct position (according to mouse)
        css({
          top: (e.pageY - 25) + "px",
          left: e.pageX + "px"
        });
      }
    });
  }
}

function computeZoom(items) { // autozoom

  setZoom(zoomIdx = 0, true);

  var i = 0,
    percentVis = 0.6,
    winW = $(window).width(),
    winH = $('#svgcon').offset().top;

  while (i < items.length) {

    var $this = $(items[i++]),
      scale = Zooms[zoomIdx] / 100;

    if (!onscreen($this, winW, winH, scale, percentVis)) {

      //log("Too-large @ " + Zooms[zoomIdx] + "%");
      setZoom(++zoomIdx, true);

      if (zoomIdx == Zooms.length - 1)
        break; // at smallest size, done

      i = 0;

      continue; // else try next smaller
    }
  }

  // OK at current size, done
}

function itemPosition($ele) {

  // first set zoom back to 100%
  setZoom(zoomIdx = 0, true);

  var off = $ele.offset(), // relative to container
    cx = $(window).width() / 2,
    cy = $(window).height() / 2.
    iw = $ele.attr('data-width') || 80,
    ih = $ele.attr('data-height') || 40;

  if (!(iw && ih && iw.length && ih.length)) {
    warn('No dimensions for item: gid=' +
      $this.attr('data-gid') + ', using ' + iw + 'x' + ih);
  }

  var $dm = $('#container');

  // compute offset of dragged container
  var dragoffX = -5000-parseInt($dm.css('margin-left')),
    dragoffY = -5000-parseInt($dm.css('margin-top'));

  // compute offset of item-center from (dragged) window-center
  var pos = {
    left: (off.left - cx) + (iw / 2) + dragoffX,
    top: (off.top  - cy) + (ih / 2) + dragoffY
  };

  // now restore zoom to user-selected level
  setZoom(zoomIdx = viewState.zoomIdx, true);

  return pos;
}

function centerZoom($ele) {

  if ($ele) {

    storeViewState(true);

    // compute target positions for transform
    var dm, margin = 10, metaOffset = 110, center = -5000,
      ww = $(window).width(),
      wh = $(window).height(),
      pos = itemPosition($ele);

    // now compute the centered position based on item-offset
    var mleft = center - pos.left,
      mtop = center - pos.top;

    // can these 2 be removed?
    var iw = parseInt($ele.attr('data-width'));
    var ih = parseInt($ele.attr('data-height'));

    // make sure left/bottom corner of meta-data is onscreen (#180)
    if (iw > ww - (metaOffset * 2 + margin)) {

      //log('HITX:  iw='+iw+" ww="+ww+" diff="+(iw - ww)  + "  offx="+offx);
      mleft += ((iw - ww) / 2) + (metaOffset + margin);
    }
    if (ih > wh - (metaOffset * 2 + margin)) {

      //log('HITY:  ih='+ih+" wh="+wh+" diff="+(ih - wh)  + "  offy="+offy);
      mtop -= ((ih - wh) / 2) + (metaOffset + margin); // bottom-margin
    }

    // reset zoom to 100%
    setZoom(zoomIdx = 0);

    // transition to center
    $('#container').css({
        marginLeft: mleft + 'px',
        marginTop: mtop + 'px'
      });

  } else { // restore zoom-state

    storeViewState(false);
  }
}

// stores zoom/drag-offset for container
function storeViewState(store) {

  var $dm = $('#container');

  if (store) {

    viewState.zoomIdx = zoomIdx;
    viewState.left = $dm.css('margin-left');
    viewState.top = $dm.css('margin-top');

  } else { // restore

    setZoom(zoomIdx = viewState.zoomIdx);
    $dm.css('margin-left', viewState.left);
    $dm.css('margin-top', viewState.top);
  }
}

function lightboxMode($selected) {

  if ($selected && !$selected.hasClass('inspected')) {

    var inspectedGid = parseInt($selected.attr('data-gid'));

    //log('Inspect.GID: '+inspectedGid);

    selectedAdSet = findAdSetByGid(inspectedGid); // throws

    // lazy-create the meta data for the adset (#61)
    if (!$selected.children('div.meta').length) {

      appendBulletsTo($selected, selectedAdSet);
    }

    $selected.addClass('inspected').siblings().removeClass('inspected');

    if (selectedAdSet.count() > 1) {

      $selected.find('span.counter-index').show(); // show index-counter
      bulletIndex($selected, selectedAdSet);

      animateInspector($selected);
    }

    var next = selectedAdSet.nextPending(); // tell the addon
    if (next && self.port) {

      self.port.emit("item-inspected", { "id": next.id });
    }

    centerZoom($selected);

    $('#container').addClass('lightbox');

  }
  else if ($('#container').hasClass('lightbox')) {

    var $item = $('.item.inspected');

    // reset the class to the group class
    setItemClass($item, selectedAdSet.groupState());

    // remove inspected & re-hide index-counter
    $item.removeClass('inspected');
    $item.find('span.counter-index').hide();

    selectedAdSet = null;

    // stop animation and restore view
    animateInspector(false);
    centerZoom(false);

    $('#container').removeClass('lightbox');
  }
}

function animateInspector($inspected) {

  animatorId && clearTimeout(animatorId); // stop

  // animate if we have a dup-ad being inspected
  if ($inspected && selectedAdSet && selectedAdSet.count() > 1) {

    animatorId = setInterval(function() {

      //log("selectedAdSet.count():" +selectedAdSet.index, $inspected.length);

      if (++selectedAdSet.index === selectedAdSet.count())
        selectedAdSet.index = 0;

      bulletIndex($inspected, selectedAdSet);

    }, animateMs);
  }
}

function findAdById(id) {

  for (var i = 0, j = gAdSets.length; i < j; i++) {

    var childIdx = gAdSets[i].childIdxForId(id);

    if (childIdx > -1) {

      return {

        ad: gAdSets[i].child(childIdx),
        group: gAdSets[i],
        index: childIdx
      };
    }
  }

  error('[ERROR] Vault: No ad for ID#' + id + " gAdSets: ", gAdSets);

  self.port && self.port.emit("refresh-vault");
}

function findItemDivByGid(gid) {

  var $item, items = $('.item');
  for (var i = 0; i < items.length; i++) {

    $item = $(items[i]);
    if (parseInt($item.attr('data-gid')) === gid)
      return $item;
  }

  return null; // item may not be available if filtered
}

function findAdSetByGid(gid) {

  for (var i = 0, j = gAdSets.length; i < j; i++) {

    if (gAdSets[i].gid === gid)
      return gAdSets[i];
  }

  throw Error('No group for gid: ' + gid);
}

function attachTests() {

  $.getJSON(TEST_ADS, function(json) {

    warn("Vault.js :: Loading test-ads: " + TEST_ADS);

    if (Type.is(json, Type.O))
      json = toAdArray(json); //BC

    layoutAds({
      data: json,
      page: TEST_PAGE
    }); // currentAd?

  }).fail(function(e) {

    warn("error(bad-json?):", e);
  });
}

function zoomIn(immediate) {

  (zoomIdx > 0) && setZoom(--zoomIdx, immediate);
}

function zoomOut(immediate) {

  (zoomIdx < Zooms.length - 1) && setZoom(++zoomIdx, immediate);
}

function setZoom(idx, immediate) {

  //log('setZoom('+idx+','+(immediate===true)+')');

  var $container = $('#container');

  // Disable transitions
  immediate && $container.addClass('notransition');

  $container.removeClass(zoomStyle).addClass // swap zoom class
    ((zoomStyle = ('z-' + Zooms[idx]).replace(/\./, '_')));

  $('#ratio').text(Zooms[idx] + '%'); // set zoom-text

  // Trigger reflow, flush cached CSS
  $container[0].offsetHeight;

  // Re-enable transitions
  immediate && $container.removeClass('notransition');
}

function onscreen($this, winW, winH, scale, percentVisible) {

  var off = $this.offset(),
    w = $this.width() * scale,
    h = $this.height() * scale,
    minX = (-w * (1 - percentVisible)),
    maxX = (winW - (w * percentVisible)),
    minY = (-h * (1 - percentVisible)),
    maxY = (winH - (h * percentVisible));

  //log('onscreen() :: trying: '+Zooms[zoomIdx]+"%",$this.attr('data-gid'),off.left, minX, maxX);

  return (!(off.left < minX || off.left > maxX || off.top < minY || off.top > maxY));
}

function openInNewTab(url) {

  window.open(url, '_blank').focus();
}

function asAdArray(adsets) { // remove

  var ads = [];
  for (var i = 0, j = adsets.length; i < j; i++) {
    for (var k = 0, m = adsets[i].children.length; k < m; k++)
      ads.push(adsets[i].children[k]);
  }
  return ads;
}

function addInterfaceHandlers(ads) {

  $('#x-close-button').click(function(e) {

    e.preventDefault();
    self.port && self.port.emit("close-vault");
  });

  $('#logo').click(function(e) {

    e.preventDefault();
    openInNewTab(LogoURL);
  });

  $(document).click(function(e) {

    if (e.which == 1) // Left-button only
      lightboxMode(false);
  });

  $(document).keyup(function(e) {

    (e.keyCode == 27) && lightboxMode(false); // esc
  });

  /////////// DRAG-STAGE ///////// from: http://jsfiddle.net/robertc/kKuqH/
  
  var $container = $('#container');
  
  if ($container) {
    
    $container.on('dragstart', dragStart);
    $container.on('dragover', dragOver);
    $container.on('dragend', dragEnd);
  }
  else {
    
    log("NO #CONTAINER!");
  }

  /////////// ZOOM-STAGE ///////////

  $('#z-in').click(function(e) {

    e.preventDefault();
    zoomIn();
  });

  $('#z-out').click(function(e) {

    e.preventDefault();
    zoomOut();
  });

  $(window).resize(function() {

    clearTimeout(resizeId); // only when done
    resizeId = setTimeout(function() {
      createSlider(true);
    }, 100);
  });

  if (EnableContextMenu) {

    // if the document is clicked somewhere
    $(document).bind("mousedown", function(e) {

      // if the clicked element is not the delete-menu
      if ($(e.target).parents(".custom-menu").length < 1) {

        $(".custom-menu").hide(50);
      }
    });


    // if a context-menu element is right-clicked
    $(".custom-menu li").click(function() {

      //log("Vault::right-click: " + $(this).attr("data-action"));

      if (!selectedAdSet) {

        error("No selectedAdSet!");
        return;
      }

      switch ($(this).attr("data-action")) {

        case "delete":

          var ids = selectedAdSet.childIds(),
            $item = findItemDivByGid(selectedAdSet.gid);

          // remove the adset item from the DOM
          $item.remove();

          // remove each ad from the full-adset
          gAds = gAds.filter(function(ad) {
            for (var i = 0, len = ids.length; i < len; i++) {
              if (ad.id === ids[i])
                return false;
            }
            return true;
          });

          // tell the addon
          self.port && self.port.emit("delete-adset", {
            ids: selectedAdSet.childIds()
          });

          // recreate the slider, but don't redo layout
          createSlider(false);

          break;

        case "delete-all": // not enabled

          self.port && self.port.emit("delete-all-similar", {});
          break;
      }

      selectedAdSet = null;

      $(".custom-menu").hide(100); // close context-menu
    });
  }

  $("body").mousewheel(function(e, delta) {

    if ($('#container').hasClass('lightbox')) {

      lightboxMode(false);
      return;
    }

    if (delta > 0) // scrolling mousewheel outward
      zoomIn();
    else
      zoomOut(); // scrolling inward
  });
}

function createAdSets(ads) { // once per layout

  log('Vault-Slider.createAdSets: ' + ads.length + '/' + gAds.length + ' ads');

  var key, ad, hash = {},
    adsets = [];

  // set hidden val for each ad
  for (var i = 0, j = ads.length; i < j; i++) {

    ad = ads[i];

    key = computeHashKey(ad);

    if (!key) continue;

    if (!hash[key]) {

      // new: add a hash entry
      hash[key] = new AdSet(ad);
      adsets.push(hash[key]);

    } else {

      // dup: add as child
      hash[key].add(ad);
    }
  }

  // sort adset children by foundTs

  for (i = 0, j = adsets.length; i < j; i++) {

    adsets[i].children.sort(byField('-foundTs'));
  }

  return adsets;
}

function doFakeLocale() {

  locale = {
    mon: "Monday",
    tue: "tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday",
    jan: "January",
    feb: "February",
    mar: "March",
    apr: "April",
    may: "May",
    jun: "June",
    jul: "Junly",
    aug: "August",
    sep: "September",
    oct: "October",
    nov: "November",
    dec: "December",
    am: "am",
    pm: "pm",
    target: "TARGET",
    foundOn: "FOUND ON",
    notYetVisited: "Not Yet Visited"
  };
}

function repack() {

  var done = false,
    $items = $(".item"),
    visible = $items.length,
    $container = $('#container');

  setTimeout(function() {
    if (!done) $('#loading-img').show();
  }, 2000);

  showAlert(visible ? false : 'no ads found');

  var loader = imagesLoaded($container, function() {

    if (visible > 1) {

      var p = new Packery('#container', {
        centered: { y: 5000 }, // centered at half min-height
        itemSelector: '.item',
        gutter: 1
      });

      computeZoom($items);
    }
    else if (visible == 1) {

      $items.css({ // center single

        top: (5000 - $items.height() / 2) + 'px',
        left: (5000 - $items.width() / 2) + 'px'
      });
    }

    done = true;

    $('#loading-img').hide();
  });
}
