package expo.modules.nativeguide

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The guide's channel rows drawn natively: tv-native's native guide rows. JS hands the lineup over
 * incrementally through `setLineup` (synchronous: the store must hold the new lineup before the view's next frame)
 * and drives one `NativeGuide` view with small props. Every set of rows has a lineup store of its own, named by the `lineupId` JS
 * gives both its `setLineup` calls and its view, so a guide mounted twice keeps two lineups.
 */
class NativeGuideModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NativeGuide")

    Function("setLineup") { lineupId: String, json: String -> LineupStores.apply(lineupId, json) }

    Function("clearLineup") { lineupId: String -> LineupStores.clear(lineupId) }

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
  }
}
