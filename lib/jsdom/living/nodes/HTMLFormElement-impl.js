"use strict";

const DOMException = require("domexception/webidl2js-wrapper");
const HTMLElementImpl = require("./HTMLElement-impl").implementation;
const { domSymbolTree } = require("../helpers/internal-constants");
const { fireAnEvent } = require("../helpers/events");
const { isListed, isSubmittable, isSubmitButton } = require("../helpers/form-controls");
const HTMLCollection = require("../generated/HTMLCollection");
const notImplemented = require("../../browser/not-implemented");
const { reflectURLAttribute } = require("../../utils");

const encTypes = new Set([
  "application/x-www-form-urlencoded",
  "multipart/form-data",
  "text/plain"
]);

const methods = new Set([
  "get",
  "post",
  "dialog"
]);

const constraintValidationPositiveResult = Symbol("positive");
const constraintValidationNegativeResult = Symbol("negative");

class HTMLFormElementImpl extends HTMLElementImpl {
  constructor(globalObject, args, privateData) {
    super(globalObject, args, privateData);

    this._isConstructingEntryList = false;
    this._isFiringSubmissions = false;
  }

  _descendantAdded(parent, child) {
    const form = this;
    for (const el of domSymbolTree.treeIterator(child)) {
      if (typeof el._changedFormOwner === "function") {
        el._changedFormOwner(form);
      }
    }

    super._descendantAdded.apply(this, arguments);
  }

  _descendantRemoved(parent, child) {
    for (const el of domSymbolTree.treeIterator(child)) {
      if (typeof el._changedFormOwner === "function") {
        el._changedFormOwner(null);
      }
    }

    super._descendantRemoved.apply(this, arguments);
  }

  // https://html.spec.whatwg.org/multipage/forms.html#dom-form-elements
  get elements() {
    // TODO: Return a HTMLFormControlsCollection
    return HTMLCollection.createImpl(this._globalObject, [], {
      element: this,
      query: () => domSymbolTree.treeToArray(this, {
        filter: node => isListed(node) && (node._localName !== "input" || node.type !== "image")
      })
    });
  }

  get length() {
    return this.elements.length;
  }

  // https://html.spec.whatwg.org/multipage/links.html#cannot-navigate
  _cannotNavigate() {
    // TODO: Correctly check if the document is fully active
    return !this.isConnected;
  }

  // https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#form-submission-algorithm
  _doSubmit(submitter = undefined, flags = {}) {
    const { submittedFromSubmit } = flags;
    // 1.
    if (this._cannotNavigate()) {
      return;
    }
    // 2.
    if (this._isConstructingEntryList) {
      return;
    }
    // 3.
    // unused until step 4 is implemented
    // 4. TODO: sandboxed forms browsing context flag blocks form submission
    // 5.
    // unused until form navigation is implemented
    // 6.
    if (!submittedFromSubmit) {
      // 6.1
      if (this._isFiringSubmissions) {
        return;
      }
      // 6.2
      // TODO: do we need to try-finally { isFiringSubmissions = false }?
      this._isFiringSubmissions = true;
      // 6.3
      if (
        submitter._noValidate === false &&
        this._interactivelyValidateConstraints() === constraintValidationNegativeResult
      ) {
        // 6.3.1
        fireAnEvent("invalid", this, undefined);
        // 6.3.2
        this._isFiringSubmissions = false;
        // 6.3.3
        return;
      }
      // 6.4
      // needed in submission navigation
      // const submitterButton = submitter === this ? null : submitter;
      // 6.5
      const shouldContinue = !fireAnEvent("submit", this, undefined, { bubbles: true, cancelable: true, submitter });
      // 6.6
      this._isFiringSubmissions = false;
      // 6.7
      if (!shouldContinue) {
        return;
      }
      // 6.8
      if (this._cannotNavigate()) {
        return;
      }
    }

    // 7.+
    notImplemented("form submission navigation", this._ownerDocument._defaultView);
  }

  submit() {
    this._doSubmit(this, { submittedFromSubmit: true });
  }

  requestSubmit(submitter = undefined) {
    if (submitter !== undefined) {
      if (!isSubmitButton(submitter)) {
        throw new TypeError("The specified element is not a submit button");
      }
      if (submitter.form !== this) {
        throw DOMException.create(this._globalObject, [
          "The specified element is not owned by this form element",
          "NotFoundError"
        ]);
      }
    }

    if (!fireAnEvent("submit", this, undefined, { bubbles: true, cancelable: true })) {
      return;
    }

    notImplemented("HTMLFormElement.prototype.requestSubmit", this._ownerDocument._defaultView);
  }

  _doReset() {
    if (!this.isConnected) {
      return;
    }

    this.reset();
  }

  reset() {
    if (!fireAnEvent("reset", this, undefined, { bubbles: true, cancelable: true })) {
      return;
    }

    for (const el of this.elements) {
      if (typeof el._formReset === "function") {
        el._formReset();
      }
    }
  }

  get method() {
    let method = this.getAttributeNS(null, "method");
    if (method) {
      method = method.toLowerCase();
    }

    if (methods.has(method)) {
      return method;
    }
    return "get";
  }

  set method(V) {
    this.setAttributeNS(null, "method", V);
  }

  get enctype() {
    let type = this.getAttributeNS(null, "enctype");
    if (type) {
      type = type.toLowerCase();
    }

    if (encTypes.has(type)) {
      return type;
    }
    return "application/x-www-form-urlencoded";
  }

  set enctype(V) {
    this.setAttributeNS(null, "enctype", V);
  }

  get action() {
    const attributeValue = this.getAttributeNS(null, "action");
    if (attributeValue === null || attributeValue === "") {
      return this._ownerDocument.URL;
    }

    return reflectURLAttribute(this, "action");
  }

  set action(V) {
    this.setAttributeNS(null, "action", V);
  }

  // If the checkValidity() method is invoked, the user agent must statically validate the
  // constraints of the form element, and return true if the constraint validation returned
  // a positive result, and false if it returned a negative result.
  checkValidity() {
  }

  // https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#interactively-validate-the-constraints
  reportValidity() {
    return this.checkValidity();
  }

  // https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#statically-validate-the-constraints
  _staticallyValidateConstraints() {
    const controls = [];
    for (const el of domSymbolTree.treeIterator(this)) {
      if (el.form === this && isSubmittable(el)) {
        controls.push(el);
      }
    }

    const invalidControls = [];

    for (const control of controls) {
      if (control._isCandidateForConstraintValidation() && !control._satisfiesConstraints()) {
        invalidControls.push(control);
      }
    }

    if (invalidControls.length === 0) {
      return { result: constraintValidationPositiveResult };
    }

    const unhandledInvalidControls = [];
    for (const invalidControl of invalidControls) {
      const notCancelled = fireAnEvent("invalid", invalidControl, undefined, { cancelable: true });
      if (notCancelled) {
        unhandledInvalidControls.push(invalidControl);
      }
    }

    return { result: constraintValidationNegativeResult, unhandledInvalidControls };
  }

  // https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#interactively-validate-the-constraints
  _interactivelyValidateConstraints() {
    // 1.
    const { result } = this._staticallyValidateConstraints();
    // 2.
    if (result === constraintValidationPositiveResult) {
      return result;
    }
    // 3. TODO report problems of unhandledInvalidControls
    // 4.
    return constraintValidationNegativeResult;
  }
}

module.exports = {
  implementation: HTMLFormElementImpl
};
