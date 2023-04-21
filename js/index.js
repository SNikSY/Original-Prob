(() => {
  // src/Validator.js
  var Validator = class {
    rules = {};
    constructor(rules) {
      this.rules = rules;
    }
    validate(value) {
      let valid = true;
      for (let rule of Object.keys(this.rules)) {
        rule = rule.toLowerCase();
        if (rule in this.methods) {
          valid = valid && this.methods[rule](value, this.rules[rule]);
          if (!this.methods[rule](value, this.rules[rule])) {
          }
        } else {
          console.warn(`Validation rule not implemented in JS: ${rule}`);
        }
      }
      return valid;
    }
    methods = {
      max(value, option) {
        return parseFloat(value) <= option;
      },
      min(value, option) {
        return parseFloat(value) >= option;
      },
      maxlength(value, option) {
        return value.length <= option;
      },
      minlength(value, option) {
        return value.length >= option;
      },
      required(value, option) {
        return value && value !== "";
      },
      maxwords(value, option) {
        return value.split(" ").length <= option;
      },
      minwords(value, option) {
        return value.split(" ").length >= option;
      },
      email(value, option) {
        const res = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return res.test(value.toLowerCase());
      },
      alpha(value, option) {
        return value.match("^[a-zA-Z]*$");
      },
      alphanum(value, option) {
        return value.match("^[a-zA-Z0-9]*$");
      },
      contains(value, option) {
        return value.includes(option);
      },
      notcontains(value, option) {
        return !value.includes(option);
      },
      integer(value, option) {
        return !isNaN(parseInt(value));
      },
      notempty(value, option) {
        return value && value === "";
      },
      startswith(value, option) {
        return value.startswith(option);
      },
      endswith(value, option) {
        return value.endswith(option);
      },
      accepted(value, option) {
        return value === true;
      }
    };
  };

  // src/Field.js
  var Field = class {
    rules = [];
    form = void 0;
    validator = void 0;
    valid = true;
    constructor(element, rules, form) {
      this.element = element;
      this.form = form;
      if (rules) {
        this.rules = rules;
        this.validator = new Validator(this.rules);
      } else {
        this.validator = new Validator({});
      }
      if (form.live) {
        this.element.addEventListener("input", (e) => {
          if (!this.valid) {
            this.validate();
          }
        });
      }
    }
    validate() {
      this.valid = this.validator.validate(this.value);
      if (this.valid) {
        this.hideError();
      } else {
        this.showError();
      }
      return this.valid;
    }
    showError() {
      this.element.classList.add("has-error");
      this.element.dispatchEvent(new Event("validation-failed"));
      for (const label of this.form.element.querySelectorAll(`label[for="${this.name}"]`)) {
        label.classList.add("has-error");
      }
    }
    hideError() {
      this.element.classList.remove("has-error");
      if (this.validator.validate(this.value)) {
        this.element.dispatchEvent(new Event("validation-succeeded"));
      }
      for (const label of this.form.element.querySelectorAll(`label[for="${this.name}"]`)) {
        label.classList.remove("has-error");
      }
    }
    get name() {
      return this.element.name;
    }
    get value() {
      if (this.element.type === "checkbox") {
        return this.element.checked;
      } else {
        return this.element.value;
      }
    }
  };

  // src/ContactForm.js
  var ContactForm = class {
    fields = [];
    element = void 0;
    live = false;
    redirect = false;
    successMessage = true;
    obscurity = "";
    token = "";
    constructor(element) {
      this.element = element;
      let rules = JSON.parse(this.element.dataset.rules) ?? {};
      this.live = this.element.dataset.live ? this.element.dataset.live.toLowerCase() === "true" : false;
      this.redirect = this.element.dataset.redirect ?? false;
      this.successMessage = this.element.querySelector("[data-success]") ?? false;
      this.token = this.element.dataset.token ?? "";
      if (this.token === "") {
        console.warn("Missing data-token on form");
      }
      for (const fe of this.element.querySelectorAll("input, textarea")) {
        const field = new Field(fe, rules[fe.name] ?? {}, this);
        this.fields.push(field);
      }
      this.element.addEventListener("submit", (event) => {
        event.stopPropagation();
        event.preventDefault();
        this.submit();
      });
      this.hashInit();
    }
    async hashInit() {
      this.obscurity = `${this.token}:${await this.hashCash()}`;
    }
    async submit() {
      const payload = {
        target: this.element.dataset.target,
        field: this.element.dataset.field,
        fields: {},
        obscurity: this.obscurity
      };
      let valid = true;
      for (const field of this.fields) {
        if (!field.validate()) {
          valid = false;
        }
        payload.fields[field.name] = field.value;
      }
      if (!valid) {
        this.element.dispatchEvent(new Event("validation-failed"));
        return false;
      } else {
        this.element.dispatchEvent(new Event("validation-succeeded"));
      }
      while (this.obscurity === "") {
        await this.delay(1e3);
      }
      const response = await fetch(this.element.action, {
        method: "post",
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!data.valid) {
        this.propagateErrors(data.errors);
        return 0;
      }
      if (!data.hashValid) {
        this.token = data.newHash;
        this.obscurity = "";
        this.hashInit();
        console.warn("Hash had expired. Re-submitting with new hash. Performance may be worse for this specific request");
        return this.submit();
      }
      if (this.redirect) {
        window.location.href = this.redirect;
      } else if (this.successMessage) {
        this.successMessage.style.display = "block";
      } else {
        console.warn("Form submit was successfull, but neither a redirect nor a success message element are present");
      }
      this.element.dispatchEvent(new Event("success"));
    }
    propagateErrors(errors) {
      for (const error of errors) {
        for (const field of this.fields) {
          if (field.name === error) {
            field.showError();
          }
        }
      }
    }
    async delay(milliseconds) {
      return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
      });
    }
    async hashCash(num = 0) {
      const text = `${this.token}:${num}`;
      const digest = await this.sha1(text);
      const check = digest.slice(0, 4);
      let valid = true;
      for (const val of check) {
        if (val !== "0") {
          valid = false;
        }
      }
      if (valid) {
        return num;
      } else {
        return this.hashCash(num + 1);
      }
    }
    async sha1(message) {
      const msgBuffer = new TextEncoder().encode(message);
      const hashBuffer = await crypto.subtle.digest("SHA-1", msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  };

  // src/index.js
  window.bearly = {};
  window.bearly.loadforms = () => {
    for (const form of document.querySelectorAll("form")) {
      if (form.dataset["smart"] && form.dataset["smart"] === "true") {
        const formObj = new ContactForm(form);
      }
    }
  };
})();
