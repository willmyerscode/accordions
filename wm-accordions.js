/* =========
  Squarespace Accordions Plugin
  An Accordions Plugin for Squarespace
  This Code is Licensed by Will-Myers.com
========== */

class wmAccordions {
  static pluginTitle = "wmAccordions";
  static isEditModeEventListenerSet = false;
  static defaultSettings = {
    accordionLimit: false,
    allowMultipleOpen: false,
    initialOpen: false,
    iconStyle: "plus",
    icons: {
      plus: '<div class="plus"><div class="plus__horizontal-line"></div><div class="plus__vertical-line"></div></div>',
      arrow: '<div class="arrow-container"><div class="arrow"></div></div>',
    },
    containerClass: "accordion-items-container",
    itemClass: "accordion-item",
    titleTag: "h4",
    titleWrapperClass: "accordion-item__title-wrapper",
    titleButtonClass: "accordion-item__click-target",
    titleTextClass: "accordion-item__title",
    subTextClass: "accordion-item__subtext",
    iconContainerClass: "accordion-icon-container",
    contentDropdownClass: "accordion-item__dropdown",
    contentDescriptionClass: "accordion-item__description",
    dividersEnabled: true,
    dividersShowFirst: true,
    dividersShowLast: true,
    dividersClass: "accordion-divider",
    dividersTopClass: "accordion-divider--top",
    accordionTitleAlignment: "left",
    iconPlacement: "right",
  };
  static get userSettings() {
    return window[wmAccordions.pluginTitle + "Settings"] || {};
  }
  constructor(el) {
    if (el.dataset.loadingState) {
      return;
    } else {
      el.dataset.loadingState = "loading";
    }
    this.el = el;
    this.source = el.dataset.source;
    if (
      this.el.parentElement.closest(
        `[data-wm-plugin="accordions"][data-source="${this.source}"]`
      )
    ) {
      console.error("Recursive accordions plugin detected");
      return;
    }
    this.loadingState = "building";
    this.installationMethod;
    if (this.source) {
      this.installationMethod = "source";
    }
    if (this.el.querySelector("button")) {
      this.installationMethod = "sections";
    }
    this.settings = wm$.deepMerge(
      {},
      wmAccordions.defaultSettings,
      wmAccordions.userSettings,
      this.instanceSettings
    );
    this.items, this.type;
    this.accordions = [];
    this.tweaks = Static?.SQUARESPACE_CONTEXT?.tweakJSON || {};
    this.init();
  }
  async init() {
    if (this.source) {
      const {items, type} = await wm$.collectionData(this.source, {
        weglotPaths: this.settings.weglotPaths,
      });
      this.items = items;
      this.type = type;
      const accordionLimit =
        typeof this.settings.accordionLimit === "number"
          ? Math.min(this.settings.accordionLimit, items.length)
          : items.length;
      this.accordions = items.slice(0, accordionLimit).map(item => ({item}));
    } else if (this.el.querySelector("button")) {
      this.installationMethod = "elements";
      const thisSection = this.el.closest("section");
      this.accordions = Array.from(this.el.querySelectorAll("button")).map(
        button => {
          const newItem = {
            title: button.textContent,
            els: [], // Initialize els as an array
          };
          const dataTarget = button.dataset.target;

          if (dataTarget) {
            const selectors = dataTarget
              .split(",")
              .map(s => s.trim())
              .filter(s => s);
            selectors.forEach(selector => {
              const targetedElements = Array.from(
                document.querySelectorAll(selector)
              );
              newItem.els.push(...targetedElements);
              // Elements targeted by data-target are moved when appended later in buildAccordions
            });
          } else {
            // Fallback to original nextElementSibling logic
            if (thisSection) {
              const nextEl = thisSection.nextElementSibling;
              if (nextEl) {
                newItem.els.push(nextEl); // Store as an array with one element
                // The removal logic is now in buildAccordions
              }
            } else {
              console.warn(
                "[wmAccordions] Could not find parent section for button during init:",
                button
              );
            }
          }
          return {item: newItem};
        }
      );
      this.addEditModeObserver();
    } else {
      return;
    }

    this._programmaticHashChangeInProgress = false;
    // Set data-is-full-width after DOM is ready and element is in place
    this.setIsFullWidth();
    this.buildAccordions();

    //Finalize Loading
    this.el.dataset.loadingState = "loaded";

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", async () => {
        await handleDOMReady.call(this);
      });
    } else {
      await handleDOMReady.call(this);
    }

    async function handleDOMReady() {
      const sections = document.querySelector("#sections");
      const lastSection = document.querySelector(
        "#sections > section:last-child .content-wrapper"
      );

      let originalParent = this.el.parentNode;
      let wasAppended = false;

      if (!sections?.contains(this.el)) {
        lastSection?.appendChild(this.el);
        wasAppended = true;
        await wm$?.reloadSquarespaceLifecycle([this.el]);
        window.dispatchEvent(new Event("resize"));
      } else {
        await wm$?.reloadSquarespaceLifecycle([this.el]);
      }

      try {
        if (typeof wm$.initializeCodeBlocks === "function") {
          await wm$.initializeCodeBlocks(this.el);
        }
        if (typeof wm$.initializeEmbedBlocks === "function") {
          await wm$.initializeEmbedBlocks(this.el);
        }
        if (typeof wm$.initializeThirdPartyPlugins === "function") {
          await wm$.initializeThirdPartyPlugins(this.el);
        }
        if (typeof wm$.handleAddingMissingColorTheme === "function") {
          await wm$.handleAddingMissingColorTheme();
        }
      } catch (error) {
        console.error("Error during initialization:", error);
      }

      if (wasAppended) {
        originalParent.appendChild(this.el);
      }

      // Listen for window resize to update the attribute
      if (!this._fullWidthResizeListenerSet && !this.settings.isFullWidth) {
        window.addEventListener("resize", this.setIsFullWidth.bind(this));
        this._fullWidthResizeListenerSet = true;
      }

      this._applyCustomSubtextFromCSS(); // Apply custom subtext after DOM is ready and other initializations

      this.handleHashNavigation(); // Initial check on page load

      // Listen for hash changes after page load
      if (!this._hashChangeListenerSet) {
        // Store the bound function to allow for potential removal later
        this._boundHandleHashNavigation = this.handleHashNavigation.bind(this);
        window.addEventListener("hashchange", this._boundHandleHashNavigation);
        this._hashChangeListenerSet = true; // Flag to prevent adding multiple listeners
      }

      if (this.settings.appendAfterBuild) {
        const refernceEl = document.querySelector(
          this.settings.appendAfterBuild
        );
        if (refernceEl) {
          refernceEl.appendChild(this.el);
        }
      }

      wm$?.emitEvent(`${wmAccordions.pluginTitle}:ready`);
      this.loadingState = "complete";
    }
  }

  _performOpen(itemElement, titleButton, contentDiv, descriptionDiv) {
    if (
      itemElement.dataset.isOpen === "true" ||
      itemElement.dataset.isItemAnimating === "true"
    )
      return;

    itemElement.dataset.isItemAnimating = "true";
    contentDiv.style.display = "block";
    const scrollHeight = descriptionDiv.scrollHeight + "px";

    requestAnimationFrame(() => {
      contentDiv.style.maxHeight = scrollHeight;
    });
    itemElement.dataset.isOpen = "true";
    titleButton.setAttribute("aria-expanded", "true");

    contentDiv.addEventListener("transitionend", function onTransitionEnd() {
      if (itemElement.dataset.isOpen === "true") {
        contentDiv.style.maxHeight = "none";
      }
      delete itemElement.dataset.isItemAnimating;
      contentDiv.removeEventListener("transitionend", onTransitionEnd);
    });
  }

  _performClose(itemElement, titleButton, contentDiv, descriptionDiv) {
    if (
      itemElement.dataset.isOpen === "false" ||
      itemElement.dataset.isItemAnimating === "true"
    )
      return;

    itemElement.dataset.isItemAnimating = "true";
    const currentScrollHeight = descriptionDiv.scrollHeight + "px";
    contentDiv.style.maxHeight = currentScrollHeight;

    requestAnimationFrame(() => {
      contentDiv.style.maxHeight = "0px";
    });
    itemElement.dataset.isOpen = "false";
    titleButton.setAttribute("aria-expanded", "false");

    contentDiv.addEventListener("transitionend", function onTransitionEnd() {
      // if (itemElement.dataset.isOpen === 'false') { contentDiv.style.maxHeight = '0px';} // Handled by animation
      delete itemElement.dataset.isItemAnimating;
      contentDiv.removeEventListener("transitionend", onTransitionEnd);
    });
  }

  openAccordion(accordionId) {
    const targetItemElement = this.el.querySelector(
      `.${this.settings.itemClass}[data-accordion-id="${accordionId}"]`
    );
    if (
      !targetItemElement ||
      targetItemElement.dataset.isItemAnimating === "true"
    )
      return;

    const targetTitleButton = targetItemElement.querySelector(
      `.${this.settings.titleButtonClass}`
    );
    const targetContentDiv = targetItemElement.querySelector(
      `.${this.settings.contentDropdownClass}`
    );
    const targetDescriptionDiv = targetContentDiv
      ? targetContentDiv.querySelector(
          `.${this.settings.contentDescriptionClass}`
        )
      : null;

    if (!targetTitleButton || !targetContentDiv || !targetDescriptionDiv)
      return;

    const isCurrentlyExpanded = targetItemElement.dataset.isOpen === "true";

    if (!this.settings.allowMultipleOpen && !isCurrentlyExpanded) {
      this.el.querySelectorAll(`.${this.settings.itemClass}`).forEach(item => {
        if (
          item.dataset.accordionId !== accordionId &&
          item.dataset.isOpen === "true"
        ) {
          const iteratingItemTitleButton = item.querySelector(
            `.${this.settings.titleButtonClass}`
          );
          const iteratingItemContentDiv = item.querySelector(
            `.${this.settings.contentDropdownClass}`
          );
          const iteratingItemDescriptionDiv = iteratingItemContentDiv
            ? iteratingItemContentDiv.querySelector(
                `.${this.settings.contentDescriptionClass}`
              )
            : null;
          if (
            iteratingItemTitleButton &&
            iteratingItemContentDiv &&
            iteratingItemDescriptionDiv
          ) {
            this._performClose(
              item,
              iteratingItemTitleButton,
              iteratingItemContentDiv,
              iteratingItemDescriptionDiv
            );
          }
        }
      });
    }

    if (isCurrentlyExpanded) {
      this._performClose(
        targetItemElement,
        targetTitleButton,
        targetContentDiv,
        targetDescriptionDiv
      );
    } else {
      this._performOpen(
        targetItemElement,
        targetTitleButton,
        targetContentDiv,
        targetDescriptionDiv
      );
      // Update URL hash if data-update-url is true and the item was opened by this click
      if (this.el.dataset.updateUrl === "true") {
        // Check if the hash is already set to this ID to avoid redundant history entries
        if (window.location.hash !== `#${accordionId}`) {
          this._programmaticHashChangeInProgress = true;
          window.location.hash = accordionId;
        }
      }
    }
  }
  buildAccordions() {
    this.el.innerHTML = "";

    const ul = document.createElement("ul");
    ul.className = this.settings.containerClass || "accordion-items-container";

    ul.dataset.shouldAllowMultipleOpenItems = this.settings.allowMultipleOpen;
    ul.dataset.isDividersEnabled = this.settings.dividersEnabled;
    ul.dataset.isFirstDividerVisible = this.settings.dividersShowFirst;
    ul.dataset.isLastDividerVisible = this.settings.dividersShowLast;
    ul.dataset.isExpandedFirstItem =
      this.settings.initialOpen === "first" || this.settings.initialOpen === 0;
    ul.dataset.accordionTitleAlignment = this.settings.titleAlignment;
    ul.dataset.accordionIconPlacement = this.settings.iconPlacement;

    this.el.appendChild(ul);

    const itemsToOpenInitially = new Set();
    if (this.settings.initialOpen !== null) {
      const initialSetting = this.settings.initialOpen;

      if (initialSetting === "all" && this.settings.allowMultipleOpen) {
        this.accordions.forEach(accData => {
          if (accData.item && typeof accData.item.title === "string") {
            itemsToOpenInitially.add(this.turnStringIntoId(accData.item.title));
          }
        });
      } else if (
        initialSetting === "first" ||
        (initialSetting === "all" && !this.settings.allowMultipleOpen)
      ) {
        // This handles 'first' and 'all' (when multiple not allowed), effectively opening the 0-indexed item
        if (
          this.accordions.length > 0 &&
          this.accordions[0].item &&
          typeof this.accordions[0].item.title === "string"
        ) {
          itemsToOpenInitially.add(
            this.turnStringIntoId(this.accordions[0].item.title)
          );
        }
      } else if (typeof initialSetting === "number" && initialSetting > 0) {
        // 1-based human number
        const itemIndex = initialSetting - 1; // Convert to 0-based index
        if (
          this.accordions[itemIndex] &&
          this.accordions[itemIndex].item &&
          typeof this.accordions[itemIndex].item.title === "string"
        ) {
          itemsToOpenInitially.add(
            this.turnStringIntoId(this.accordions[itemIndex].item.title)
          );
        }
      } else if (
        typeof initialSetting === "string" &&
        initialSetting !== "all" &&
        initialSetting !== "first"
      ) {
        // If it's a string and not 'all' or 'first', assume it's a specific ID.
        itemsToOpenInitially.add(initialSetting);
      }
    }

    let firstMarkedToOpenProcessed = false;

    this.accordions.forEach((accordionData, index) => {
      const accordionItem = accordionData.item;
      const itemId = this.turnStringIntoId(accordionItem.title);

      const isFirstItem = index === 0;
      const isLastItem = index === this.accordions.length - 1;

      const itemElement = document.createElement("li");
      itemElement.classList.add(this.settings.itemClass);
      itemElement.dataset.accordionId = itemId;

      if (this.settings.dividersEnabled) {
        if (isFirstItem && this.settings.dividersShowFirst) {
          const topDivider = document.createElement("div");
          topDivider.className = `${this.settings.dividersClass} ${this.settings.dividersTopClass}`;
          topDivider.setAttribute("aria-hidden", "true");
          itemElement.appendChild(topDivider);
        }
      }

      const titleWrapper = document.createElement(
        this.settings.titleTag
      );
      titleWrapper.className = this.settings.titleWrapperClass;
      titleWrapper.setAttribute("role", "heading");
      titleWrapper.setAttribute("aria-level", "3");

      const titleButton = document.createElement("button");
      titleButton.className = this.settings.titleButtonClass;
      titleButton.id = `button-${itemId}`;
      titleButton.setAttribute("aria-controls", `dropdown-${itemId}`);

      const maxWidthSpan = document.createElement("span");
      maxWidthSpan.className = "max-width-span";

      const titleTextSpan = document.createElement("span");
      titleTextSpan.className = this.settings.titleTextClass;
      titleTextSpan.textContent = accordionItem.title;
      maxWidthSpan.appendChild(titleTextSpan);

      const subText = document.createElement("span");
      subText.className = this.settings.subTextClass;
      subText.textContent = accordionItem.subText;
      titleTextSpan.appendChild(subText);

      const iconStyle = this.settings.iconStyle;
      let iconContainer;
      if (iconStyle) {
        iconContainer = document.createElement("div");
        iconContainer.innerHTML = this.settings.icons[iconStyle];
        iconContainer.className = this.settings.iconContainerClass;
        iconContainer.setAttribute("aria-hidden", "true");
        maxWidthSpan.appendChild(iconContainer);
        if (iconStyle !== "arrow" && iconStyle !== "plus") {
          this.el.dataset.customIcon = iconStyle;
        }
      }

      titleButton.appendChild(maxWidthSpan);
      titleWrapper.appendChild(titleButton);
      itemElement.appendChild(titleWrapper);

      const contentDropdownDiv = document.createElement("div");
      contentDropdownDiv.className = this.settings.contentDropdownClass;
      contentDropdownDiv.id = `dropdown-${itemId}`;
      contentDropdownDiv.setAttribute("role", "region");
      contentDropdownDiv.setAttribute("aria-labelledby", `button-${itemId}`);

      const contentDescriptionDiv = document.createElement("div");
      contentDescriptionDiv.className = this.settings.contentDescriptionClass;
      if (accordionItem.els && accordionItem.els.length > 0) {
        accordionItem.els.forEach(el => {
          if (el && el.parentNode) {
            // Ensure el exists and has a parent before trying to remove
            el.parentNode.removeChild(el);
          }
          contentDescriptionDiv.appendChild(el);
        });
      } else if (accordionItem.body) {
        contentDescriptionDiv.innerHTML = accordionItem.body;
      }
      contentDropdownDiv.appendChild(contentDescriptionDiv);

      itemElement.appendChild(contentDropdownDiv);

      if (this.settings.dividersEnabled) { 
        if (isLastItem && this.settings.dividersShowLast) {
          const bottomDivider = document.createElement("div");
          bottomDivider.className = this.settings.dividersClass;
          bottomDivider.setAttribute("aria-hidden", "true");
          itemElement.appendChild(bottomDivider);
        } else if (!isLastItem) {
          const bottomDivider = document.createElement("div");
          bottomDivider.className = this.settings.dividersClass;
          bottomDivider.setAttribute("aria-hidden", "true");
          itemElement.appendChild(bottomDivider);
        }
      }

      ul.appendChild(itemElement);

      let shouldThisBeOpen = itemsToOpenInitially.has(itemId);

      if (!this.settings.allowMultipleOpen && shouldThisBeOpen) {
        if (firstMarkedToOpenProcessed) {
          shouldThisBeOpen = false;
        } else {
          firstMarkedToOpenProcessed = true;
        }
      }

      if (shouldThisBeOpen) {
        titleButton.setAttribute("aria-expanded", "true");
        contentDropdownDiv.style.display = "block";
        itemElement.dataset.isOpen = "true";
        contentDropdownDiv.style.maxHeight = "none"; // Initially open, so no max-height restriction
      } else {
        titleButton.setAttribute("aria-expanded", "false");
        contentDropdownDiv.style.maxHeight = "0px";
        itemElement.dataset.isOpen = "false";
        contentDropdownDiv.style.maxHeight = "0px"; // Start with max-height 0 for animation
      }

      titleButton.addEventListener("click", () => {
        this.openAccordion(itemId);
      });
    });
  }
  setIsFullWidth() {
    const tolerance = 2; // px, for rounding errors
    const elRect = this.el.getBoundingClientRect();
    const windowWidth =
      window.innerWidth || document.documentElement.clientWidth;
    if (Math.abs(elRect.width - windowWidth) <= tolerance) {
      this.el.setAttribute("data-is-full-width", "true");
    } else {
      this.el.removeAttribute("data-is-full-width");
    }
  }
  turnStringIntoId(string) {
    let baseId = string
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    let finalId = baseId;
    let counter = 1;
    // Check if the ID already exists in the current accordion instance (this.el)
    while (
      this.el &&
      document.querySelector(`[data-accordion-id="${finalId}"]`)
    ) {
      finalId = `${baseId}-${counter}`;
      counter++;
    }
    return finalId;
  }
  _applyCustomSubtextFromCSS() {
    const itemElements = this.el.querySelectorAll(
      `.${this.settings.itemClass}[data-accordion-id]`
    );
    itemElements.forEach(itemElement => {
      const subTextSpan = itemElement.querySelector(
        `.${this.settings.subTextClass}`
      );
      if (subTextSpan) {
        const computedStyle = window.getComputedStyle(itemElement);
        let customPropertyValue = computedStyle
          .getPropertyValue("--wm-accordion-subtext")
          .trim();
        if (customPropertyValue) {
          // Check if the string starts and ends with a double quote
          if (
            (customPropertyValue.startsWith('"') &&
              customPropertyValue.endsWith('"')) ||
            (customPropertyValue.startsWith("'") &&
              customPropertyValue.endsWith("'"))
          ) {
            // Remove the surrounding double quotes
            customPropertyValue = customPropertyValue.substring(
              1,
              customPropertyValue.length - 1
            );
          }
          subTextSpan.textContent = customPropertyValue;
        }
      }
    });
  }
  addEditModeObserver() {
    const isBackend = window.self !== window.top;
    if (wmAccordions.isEditModeEventListenerSet || !isBackend) return;

    let deconstructed = false;
    // Observe changes to the body's class attribute
    const bodyObserver = new MutationObserver(async mutations => {
      for (const mutation of mutations) {
        if (mutation.attributeName === "class") {
          const classList = document.body.classList;
          if (classList.contains("sqs-edit-mode-active")) {
            if (!deconstructed && this.accordions) {
              deconstructed = true;
              this.accordions.forEach(accordion => {
                if (
                  accordion.item &&
                  accordion.item.els &&
                  Array.isArray(accordion.item.els)
                ) {
                  accordion.item.els.forEach(el => {
                    if (el && el.parentNode) {
                      // This removes the element from its current parent (within the accordion structure)
                      el.parentNode.removeChild(el);
                    }
                  });
                }
              });
              // Optionally, clear the main element if you want to remove titles/structure too
              // this.el.innerHTML = '';
              try {
                await wm$.reloadSquarespaceLifecycle();
              } catch (error) {
                console.error("Error reloading Squarespace lifecycle:", error);
              }
              bodyObserver.disconnect();
            }
          }
        }
      }
    });

    bodyObserver.observe(document.body, {
      attributes: true,
    });

    wmAccordions.isEditModeEventListenerSet = true;
  }
  handleHashNavigation() {
    if (this._programmaticHashChangeInProgress) {
      this._programmaticHashChangeInProgress = false;
      return;
    }
    // --- HASH NAVIGATION LOGIC ---
    if (window.location.hash) {
      const hashId = window.location.hash.replace("#", "");
      const targetItem = this.el.querySelector(
        `.${this.settings.itemClass}[data-accordion-id="${hashId}"]`
      );
      if (targetItem) {
        // If not allowing multiple open, close all others first
        if (!this.settings.allowMultipleOpen) {
          this.el
            .querySelectorAll(`.${this.settings.itemClass}`)
            .forEach(item => {
              if (item !== targetItem && item.dataset.isOpen === "true") {
                const btn = item.querySelector(
                  `.${this.settings.titleButtonClass}`
                );
                const contentDiv = item.querySelector(
                  `.${this.settings.contentDropdownClass}`
                );
                const descDiv = contentDiv
                  ? contentDiv.querySelector(
                      `.${this.settings.contentDescriptionClass}`
                    )
                  : null;
                if (btn && contentDiv && descDiv) {
                  this._performClose(item, btn, contentDiv, descDiv);
                }
              }
            });
        }
        // Open the target accordion if not already open
        if (targetItem.dataset.isOpen !== "true") {
          const btn = targetItem.querySelector(
            `.${this.settings.titleButtonClass}`
          );
          const contentDiv = targetItem.querySelector(
            `.${this.settings.contentDropdownClass}`
          );
          const descDiv = contentDiv
            ? contentDiv.querySelector(
                `.${this.settings.contentDescriptionClass}`
              )
            : null;
          if (btn && contentDiv && descDiv) {
            this._performOpen(targetItem, btn, contentDiv, descDiv);
          }
        }
        // Scroll into view after a short delay to allow open animation
        setTimeout(() => {
          targetItem.scrollIntoView({behavior: "smooth", block: "start"});
        }, 400);
      }
    }
  }
  get instanceSettings() {
    const dataAttributes = {};

    if (this.el.dataset.desktopNavigationType) {
      this.el.dataset.breakpoints__767__navigationType =
        this.el.dataset.desktopNavigationType;
    }
    if (this.el.dataset.mobileNavigationType) {
      this.el.dataset.breakpoints__0__navigationType =
        this.el.dataset.mobileNavigationType;
    }

    // Function to set value in a nested object based on key path
    const setNestedProperty = (obj, keyPath, value) => {
      const keys = keyPath.split("__");
      let current = obj;

      keys.forEach((key, index) => {
        if (index === keys.length - 1) {
          current[key] = wm$.parseAttr(value);
        } else {
          current = current[key] = current[key] || {};
        }
      });
    };

    for (let [attrName, value] of Object.entries(this.el.dataset)) {
      setNestedProperty(dataAttributes, attrName, value);
    }
    return dataAttributes;
  }
}

(() => {
  function initAccordions() {
    const els = document.querySelectorAll('[data-wm-plugin="accordions"]');
    if (!els.length) return;
    els.forEach(el => (el.wmAccordions = new wmAccordions(el)));
  }
  window.wmAccordions = {
    init: () => initAccordions(),
  };
  window.wmAccordions.init();
})();
