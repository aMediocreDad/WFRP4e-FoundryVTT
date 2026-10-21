import BaseWFRP4eItemSheet from "./base";

export default class SpellSheet extends BaseWFRP4eItemSheet
{
  static type="spell"

  static DEFAULT_OPTIONS = {
    classes: [this.type],
  }
  
  static PARTS = {
    header : {scrollable: [""], template : 'systems/wfrp4e/templates/sheets/item/item-header.hbs', classes: ["sheet-header"] },
    tabs: { scrollable: [""], template: 'systems/wfrp4e/templates/sheets/item/item-tabs.hbs' },
    description: { scrollable: [""], template: 'systems/wfrp4e/templates/sheets/item/tabs/item-description.hbs' },
    details: { scrollable: [""], template: `systems/wfrp4e/templates/sheets/item/types/${this.type}.hbs` },
    effects: { scrollable: [""], template: 'systems/wfrp4e/templates/sheets/item/tabs/item-effects.hbs' },
  }

  async _prepareContext(options)
  {
    let context = await super._prepareContext(options);

    context.loreNames = this._sourceLore().map(i => {
      return game.wfrp4e.config.magicLores[i] ? game.wfrp4e.config.magicLores[i] : i
    })
    context.overcastTypes = {
      value : game.i18n.localize("Value"),
      SL : game.i18n.localize("SL"),
      characteristic : game.i18n.localize("Characteristic")
    }
    return context;
  }

  
  _addEventListeners()
  {    
    super._addEventListeners();
    this.element.querySelector("[data-action='editLore']")?.addEventListener("change", this.constructor._onEditLore.bind(this));
    this.element.querySelector(".name-list .empty")?.addEventListener("focusin", this._onAddLore.bind(this))
  }

  /**
   * The spell's OWN Lore, as stored, rather than the Lore it may be showing.
   *
   * An Arcane Spell owned by a wizard derives a Lore from its owner's Arcane Magic Talents at preparation time
   * (5e p.242, SpellModel#_deriveArcaneLore), so `system.lore.value` reads as the owner's Lore while `_source` still
   * holds the spell's own, empty one. This editor edits the spell, not its current owner, so every read and write
   * below goes through here. Reading the prepared value instead would let any edit of the list write the owner's
   * Lore into the Item - permanently tagging an Arcane spell with the Lore of whoever happened to be holding it,
   * which is exactly what deriving rather than storing is meant to avoid.
   *
   * @returns {string[]} a copy, safe to concat or map into an update
   */
  _sourceLore()
  {
    return foundry.utils.duplicate(this.document._source.system.lore.value || []);
  }

  /** True when this event targets the Lore list, the one list on this sheet whose displayed value can be derived. */
  _isLoreList(ev)
  {
    return this._getPath(ev) == "system.lore.value";
  }

  /** @inheritdoc */
  _handleArrayCreate(doc, ev)
  {
    if (!this._isLoreList(ev)) return super._handleArrayCreate(doc, ev);
    let value = parseInt(ev.target.value) || ev.target.value;
    doc.update({"system.lore.value" : this._sourceLore().concat(value)});
  }

  /** @inheritdoc */
  _handleArrayDelete(doc, ev)
  {
    if (!this._isLoreList(ev)) return super._handleArrayDelete(doc, ev);
    let index = this._getIndex(ev);
    doc.update({"system.lore.value" : this._sourceLore().filter((_, i) => i != index)});
  }

  /** @inheritdoc */
  _handleArrayEdit(doc, ev)
  {
    if (!this._isLoreList(ev)) return super._handleArrayEdit(doc, ev);
    let index = this._getIndex(ev);
    doc.update({"system.lore.value" : this._sourceLore().map((val, i) => i == index ? ev.target.value : val)});
  }

  async _onAddLore(ev)
  {
    let lores = await ItemDialog.create(ItemDialog.objectToArray(game.wfrp4e.config.magicLores), "unlimited", {text: "Choose Lores to Add", title : "Lore"});

    this.document.update({"system.lore.value" : this._sourceLore().concat(lores.map(i => i.id))})
  }

  static _onEditLore(ev)
  {
    let lore = ev.target.value;
    let key = warhammer.utility.findKey(lore, game.wfrp4e.config.magicLores)
    if (key)
    {
      this.document.update({"system.lore.value" : key})
    }
    else 
    {
      this.document.update({"system.lore.value" : lore})
    }
  }

}