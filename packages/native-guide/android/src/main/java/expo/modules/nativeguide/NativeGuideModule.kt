package expo.modules.nativeguide

import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The guide's channel rows drawn natively: tv-native's native guide rows. JS hands the lineup over
 * incrementally through `setLineup` (synchronous: the store must hold the new lineup before the view's next frame)
 * and drives one `NativeGuide` view with small props. Every set of rows has a lineup store of its own, named by the `lineupId` JS
 * gives both its `setLineup` calls and its view, so a guide mounted twice keeps two lineups.
 */
class NativeGuideModule : Module() {
  private companion object {
    const val LOG_TAG = "AirwaveGuide"
  }

  override fun definition() = ModuleDefinition {
    Name("NativeGuide")

    Function("setLineup") { lineupId: String, json: String -> LineupStores.apply(lineupId, json) }

    Function("clearLineup") { lineupId: String -> LineupStores.clear(lineupId) }

    // One line to logcat (tag AirwaveGuide) saying which renderer draws the guide and why. JS sends it when the choice is made
    // and again whenever it changes, so a bug report can say what the app chose.
    Function("logRenderer") { line: String -> Log.i(LOG_TAG, line.take(300)) }

    // The icons the rail's circle can draw, as lucide icon nodes keyed by icon-set id. JS sends each one once; adding is
    // idempotent. Returns how many it read.
    Function("setGlyphs") { json: String -> LucideGlyphs.register(json) }

    View(NativeGuideView::class) {
      Events("onRenderError")
      Prop("lineupId") { view: NativeGuideView, v: String -> view.setLineupId(v) }
      Prop("lineupVersion") { view: NativeGuideView, v: Int -> view.setLineupVersion(v) }
      Prop("geo") { view: NativeGuideView, s: String -> view.setGeo(s) }
      Prop("nowMs") { view: NativeGuideView, v: Double -> view.setNowMs(v) }
      Prop("tokens") { view: NativeGuideView, s: String -> view.setTokens(s) }
      Prop("focusRow") { view: NativeGuideView, v: Int -> view.setFocusRow(v) }
      Prop("focusProgramId") { view: NativeGuideView, v: String -> view.setFocusProgramId(v) }
      Prop("zone") { view: NativeGuideView, v: String -> view.setZone(v) }
      Prop("miniFocused") { view: NativeGuideView, v: Boolean -> view.setMiniFocused(v) }
      Prop("scrollY") { view: NativeGuideView, v: Double -> view.setScrollY(v) }
      Prop("backdrop") { view: NativeGuideView, v: String -> view.setBackdrop(v) }
      OnViewDidUpdateProps { view: NativeGuideView -> view.propsUpdated() }
    }

    // A theme's graph paper behind the guide, drawn as lines. Defined after the rows' view: the first view a module defines is the one
    // `requireNativeView("NativeGuide")` gets without naming it.
    View(NativeGuidePatternView::class) {
      Prop("pattern") { view: NativeGuidePatternView, s: String -> view.setPattern(s) }
      Prop("unit") { view: NativeGuidePatternView, v: Double -> view.setUnit(v) }
    }

    // One lucide icon: the featured panel's channel tile and its rating star.
    View(NativeGuideGlyphView::class) {
      Prop("icon") { view: NativeGuideGlyphView, s: String -> view.setIcon(s) }
      Prop("color") { view: NativeGuideGlyphView, s: String -> view.setColor(s) }
      Prop("fill") { view: NativeGuideGlyphView, s: String -> view.setFill(s) }
      Prop("strokeWidth") { view: NativeGuideGlyphView, v: Double -> view.setStrokeWidth(v) }
    }

    // The featured panel's progress bar when a theme draws it as a ruler.
    View(NativeGuideDimensionView::class) {
      Prop("spec") { view: NativeGuideDimensionView, s: String -> view.setSpec(s) }
    }
  }
}
