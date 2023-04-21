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
    successMessage = false;
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
// # sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL1ZhbGlkYXRvci5qcyIsICIuLi9zcmMvRmllbGQuanMiLCAiLi4vc3JjL0NvbnRhY3RGb3JtLmpzIiwgIi4uL3NyYy9pbmRleC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZXhwb3J0IGRlZmF1bHQgY2xhc3MgVmFsaWRhdG9yIHtcbiAgcnVsZXMgPSB7fTtcblxuICBjb25zdHJ1Y3RvcihydWxlcykge1xuICAgIHRoaXMucnVsZXMgPSBydWxlcztcbiAgfVxuXG4gIHZhbGlkYXRlKHZhbHVlKSB7XG4gICAgbGV0IHZhbGlkID0gdHJ1ZVxuICAgIGZvciAobGV0IHJ1bGUgb2YgT2JqZWN0LmtleXModGhpcy5ydWxlcykpIHtcbiAgICAgIHJ1bGUgPSBydWxlLnRvTG93ZXJDYXNlKClcbiAgICAgIGlmIChydWxlIGluIHRoaXMubWV0aG9kcykge1xuICAgICAgICB2YWxpZCA9IHZhbGlkICYmIHRoaXMubWV0aG9kc1tydWxlXSh2YWx1ZSwgdGhpcy5ydWxlc1tydWxlXSlcbiAgICAgICAgaWYgKCF0aGlzLm1ldGhvZHNbcnVsZV0odmFsdWUsIHRoaXMucnVsZXNbcnVsZV0pKSB7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgVmFsaWRhdGlvbiBydWxlIG5vdCBpbXBsZW1lbnRlZCBpbiBKUzogJHtydWxlfWApXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB2YWxpZFxuICB9XG5cbiAgbWV0aG9kcyA9IHtcbiAgICBtYXgodmFsdWUsIG9wdGlvbikge1xuICAgICAgcmV0dXJuIHBhcnNlRmxvYXQodmFsdWUpIDw9IG9wdGlvbjtcbiAgICB9LFxuICAgIG1pbih2YWx1ZSwgb3B0aW9uKSB7XG4gICAgICByZXR1cm4gcGFyc2VGbG9hdCh2YWx1ZSkgPj0gb3B0aW9uO1xuICAgIH0sXG4gICAgbWF4bGVuZ3RoKHZhbHVlLCBvcHRpb24pIHtcbiAgICAgIHJldHVybiB2YWx1ZS5sZW5ndGggPD0gb3B0aW9uO1xuICAgIH0sXG4gICAgbWlubGVuZ3RoKHZhbHVlLCBvcHRpb24pIHtcbiAgICAgIHJldHVybiB2YWx1ZS5sZW5ndGggPj0gb3B0aW9uO1xuICAgIH0sXG4gICAgcmVxdWlyZWQodmFsdWUsIG9wdGlvbikge1xuICAgICAgcmV0dXJuIHZhbHVlICYmIHZhbHVlICE9PSBcIlwiO1xuICAgIH0sXG4gICAgbWF4d29yZHModmFsdWUsIG9wdGlvbikge1xuICAgICAgcmV0dXJuIHZhbHVlLnNwbGl0KFwiIFwiKS5sZW5ndGggPD0gb3B0aW9uO1xuICAgIH0sXG4gICAgbWlud29yZHModmFsdWUsIG9wdGlvbikge1xuICAgICAgcmV0dXJuIHZhbHVlLnNwbGl0KFwiIFwiKS5sZW5ndGggPj0gb3B0aW9uO1xuICAgIH0sXG4gICAgZW1haWwodmFsdWUsIG9wdGlvbikge1xuICAgICAgY29uc3QgcmVzID1cbiAgICAgICAgL14oKFtePD4oKVxcW1xcXVxcXFwuLDs6XFxzQFwiXSsoXFwuW148PigpXFxbXFxdXFxcXC4sOzpcXHNAXCJdKykqKXwoXCIuK1wiKSlAKChcXFtbMC05XXsxLDN9XFwuWzAtOV17MSwzfVxcLlswLTldezEsM31cXC5bMC05XXsxLDN9XFxdKXwoKFthLXpBLVpcXC0wLTldK1xcLikrW2EtekEtWl17Mix9KSkkLztcbiAgICAgIHJldHVybiByZXMudGVzdCh2YWx1ZS50b0xvd2VyQ2FzZSgpKTtcbiAgICB9LFxuICAgIGFscGhhKHZhbHVlLCBvcHRpb24pIHtcbiAgICAgIHJldHVybiB2YWx1ZS5tYXRjaChcIl5bYS16QS1aXSokXCIpO1xuICAgIH0sXG4gICAgYWxwaGFudW0odmFsdWUsIG9wdGlvbikge1xuICAgICAgcmV0dXJuIHZhbHVlLm1hdGNoKFwiXlthLXpBLVowLTldKiRcIik7XG4gICAgfSxcbiAgICBjb250YWlucyh2YWx1ZSwgb3B0aW9uKSB7XG4gICAgICByZXR1cm4gdmFsdWUuaW5jbHVkZXMob3B0aW9uKTtcbiAgICB9LFxuICAgIG5vdGNvbnRhaW5zKHZhbHVlLCBvcHRpb24pIHtcbiAgICAgIHJldHVybiAhdmFsdWUuaW5jbHVkZXMob3B0aW9uKTtcbiAgICB9LFxuICAgIGludGVnZXIodmFsdWUsIG9wdGlvbikge1xuICAgICAgcmV0dXJuICFpc05hTihwYXJzZUludCh2YWx1ZSkpO1xuICAgIH0sXG4gICAgbm90ZW1wdHkodmFsdWUsIG9wdGlvbikge1xuICAgICAgcmV0dXJuIHZhbHVlICYmIHZhbHVlID09PSBcIlwiO1xuICAgIH0sXG4gICAgc3RhcnRzd2l0aCh2YWx1ZSwgb3B0aW9uKSB7XG4gICAgICByZXR1cm4gdmFsdWUuc3RhcnRzd2l0aChvcHRpb24pO1xuICAgIH0sXG4gICAgZW5kc3dpdGgodmFsdWUsIG9wdGlvbikge1xuICAgICAgcmV0dXJuIHZhbHVlLmVuZHN3aXRoKG9wdGlvbik7XG4gICAgfSxcbiAgICBhY2NlcHRlZCh2YWx1ZSwgb3B0aW9uKSB7XG4gICAgICByZXR1cm4gdmFsdWUgPT09IHRydWVcbiAgICB9XG4gIH07XG59XG4iLCAiaW1wb3J0IFZhbGlkYXRvciBmcm9tIFwiLi9WYWxpZGF0b3JcIjtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRmllbGQge1xuICBydWxlcyA9IFtdO1xuICBmb3JtID0gdW5kZWZpbmVkXG4gIHZhbGlkYXRvciA9IHVuZGVmaW5lZDtcbiAgdmFsaWQgPSB0cnVlO1xuXG4gIGNvbnN0cnVjdG9yKGVsZW1lbnQsIHJ1bGVzLCBmb3JtKSB7XG4gICAgdGhpcy5lbGVtZW50ID0gZWxlbWVudDtcbiAgICB0aGlzLmZvcm0gPSBmb3JtXG4gICAgaWYgKHJ1bGVzKSB7XG4gICAgICB0aGlzLnJ1bGVzID0gcnVsZXNcbiAgICAgIHRoaXMudmFsaWRhdG9yID0gbmV3IFZhbGlkYXRvcih0aGlzLnJ1bGVzKVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnZhbGlkYXRvciA9IG5ldyBWYWxpZGF0b3Ioe30pXG4gICAgfVxuXG4gICAgaWYoZm9ybS5saXZlKSB7XG4gICAgICB0aGlzLmVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCBlID0+IHtcbiAgICAgICAgaWYgKCF0aGlzLnZhbGlkKSB7XG4gICAgICAgICAgdGhpcy52YWxpZGF0ZSgpXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfVxuICB9XG5cbiAgdmFsaWRhdGUoKSB7XG4gICAgdGhpcy52YWxpZCA9IHRoaXMudmFsaWRhdG9yLnZhbGlkYXRlKHRoaXMudmFsdWUpXG4gICAgaWYgKHRoaXMudmFsaWQpIHtcbiAgICAgIHRoaXMuaGlkZUVycm9yKClcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5zaG93RXJyb3IoKVxuICAgIH1cbiAgICByZXR1cm4gdGhpcy52YWxpZFxuICB9XG5cbiAgc2hvd0Vycm9yKCkge1xuICAgIHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdoYXMtZXJyb3InKTtcbiAgICB0aGlzLmVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ3ZhbGlkYXRpb24tZmFpbGVkJykpO1xuICAgIGZvciAoY29uc3QgbGFiZWwgb2YgdGhpcy5mb3JtLmVsZW1lbnQucXVlcnlTZWxlY3RvckFsbChgbGFiZWxbZm9yPVwiJHt0aGlzLm5hbWV9XCJdYCkpIHtcbiAgICAgIGxhYmVsLmNsYXNzTGlzdC5hZGQoJ2hhcy1lcnJvcicpXG4gICAgfVxuICB9XG5cbiAgaGlkZUVycm9yKCkge1xuICAgIHRoaXMuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdoYXMtZXJyb3InKTtcbiAgICBpZiAodGhpcy52YWxpZGF0b3IudmFsaWRhdGUodGhpcy52YWx1ZSkpIHtcbiAgICAgIHRoaXMuZWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgndmFsaWRhdGlvbi1zdWNjZWVkZWQnKSk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgbGFiZWwgb2YgdGhpcy5mb3JtLmVsZW1lbnQucXVlcnlTZWxlY3RvckFsbChgbGFiZWxbZm9yPVwiJHt0aGlzLm5hbWV9XCJdYCkpIHtcbiAgICAgIGxhYmVsLmNsYXNzTGlzdC5yZW1vdmUoJ2hhcy1lcnJvcicpXG4gICAgfVxuICB9XG5cbiAgZ2V0IG5hbWUoKSB7XG4gICAgcmV0dXJuIHRoaXMuZWxlbWVudC5uYW1lO1xuICB9XG5cbiAgZ2V0IHZhbHVlKCkge1xuICAgIGlmICh0aGlzLmVsZW1lbnQudHlwZSA9PT0gJ2NoZWNrYm94Jykge1xuICAgICAgcmV0dXJuIHRoaXMuZWxlbWVudC5jaGVja2VkXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB0aGlzLmVsZW1lbnQudmFsdWU7XG4gICAgfVxuICB9XG59XG4iLCAiaW1wb3J0IEZpZWxkIGZyb20gXCIuL0ZpZWxkXCI7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIENvbnRhY3RGb3JtIHtcbiAgZmllbGRzID0gW107XG4gIGVsZW1lbnQgPSB1bmRlZmluZWQ7XG4gIGxpdmUgPSBmYWxzZTtcbiAgcmVkaXJlY3QgPSBmYWxzZVxuICBzdWNjZXNzTWVzc2FnZSA9IGZhbHNlXG4gIG9ic2N1cml0eSA9ICcnXG4gIHRva2VuID0gJydcblxuICBjb25zdHJ1Y3RvcihlbGVtZW50KSB7XG4gICAgdGhpcy5lbGVtZW50ID0gZWxlbWVudDtcbiAgICBsZXQgcnVsZXMgPSBKU09OLnBhcnNlKHRoaXMuZWxlbWVudC5kYXRhc2V0LnJ1bGVzKSA/PyB7fVxuICAgIHRoaXMubGl2ZSA9ICB0aGlzLmVsZW1lbnQuZGF0YXNldC5saXZlID8gdGhpcy5lbGVtZW50LmRhdGFzZXQubGl2ZS50b0xvd2VyQ2FzZSgpID09PSAndHJ1ZScgOiBmYWxzZVxuICAgIHRoaXMucmVkaXJlY3QgPSB0aGlzLmVsZW1lbnQuZGF0YXNldC5yZWRpcmVjdCA/PyBmYWxzZVxuICAgIHRoaXMuc3VjY2Vzc01lc3NhZ2UgPSB0aGlzLmVsZW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtc3VjY2Vzc10nKSA/PyBmYWxzZVxuICAgIHRoaXMudG9rZW4gPSB0aGlzLmVsZW1lbnQuZGF0YXNldC50b2tlbiA/PyAnJ1xuICAgIGlmICh0aGlzLnRva2VuID09PSAnJykge1xuICAgICAgY29uc29sZS53YXJuKCdNaXNzaW5nIGRhdGEtdG9rZW4gb24gZm9ybScpXG4gICAgfVxuXG4gICAgLy8gRmllbGQgc2V0dXBcbiAgICBmb3IgKGNvbnN0IGZlIG9mIHRoaXMuZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKFwiaW5wdXQsIHRleHRhcmVhXCIpKSB7XG4gICAgICBjb25zdCBmaWVsZCA9IG5ldyBGaWVsZChmZSwgcnVsZXNbZmUubmFtZV0gPz8ge30sIHRoaXMpO1xuICAgICAgdGhpcy5maWVsZHMucHVzaChmaWVsZCk7XG4gICAgfVxuXG4gICAgLy8gRXZlbnRzXG4gICAgdGhpcy5lbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJzdWJtaXRcIiwgKGV2ZW50KSA9PiB7XG4gICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICB0aGlzLnN1Ym1pdCgpO1xuICAgIH0pO1xuXG4gICAgLy8gU3RhcnQgaGFzaCBnZW5lcmF0aW9uXG4gICAgdGhpcy5oYXNoSW5pdCgpXG4gIH1cblxuICBhc3luYyBoYXNoSW5pdCgpIHtcbiAgICB0aGlzLm9ic2N1cml0eSA9IGAke3RoaXMudG9rZW59OiR7YXdhaXQgdGhpcy5oYXNoQ2FzaCgpfWA7XG4gIH1cblxuICBhc3luYyBzdWJtaXQoKSB7XG4gICAgY29uc3QgcGF5bG9hZCA9IHtcbiAgICAgIHRhcmdldDogdGhpcy5lbGVtZW50LmRhdGFzZXQudGFyZ2V0LFxuICAgICAgZmllbGQ6IHRoaXMuZWxlbWVudC5kYXRhc2V0LmZpZWxkLFxuICAgICAgZmllbGRzOiB7fSxcbiAgICAgIG9ic2N1cml0eTogdGhpcy5vYnNjdXJpdHlcbiAgICB9O1xuXG4gICAgbGV0IHZhbGlkID0gdHJ1ZVxuICAgIGZvciAoY29uc3QgZmllbGQgb2YgdGhpcy5maWVsZHMpIHtcbiAgICAgIGlmICghZmllbGQudmFsaWRhdGUoKSkge1xuICAgICAgICB2YWxpZCA9IGZhbHNlXG4gICAgICB9XG4gICAgICBwYXlsb2FkLmZpZWxkc1tmaWVsZC5uYW1lXSA9IGZpZWxkLnZhbHVlO1xuICAgIH1cblxuICAgIGlmICghdmFsaWQpIHtcbiAgICAgIHRoaXMuZWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgndmFsaWRhdGlvbi1mYWlsZWQnKSk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuZWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgndmFsaWRhdGlvbi1zdWNjZWVkZWQnKSk7XG4gICAgfVxuXG4gICAgLy8gV2FpdCBmb3IgaGFzaENhc2hcbiAgICB3aGlsZSAodGhpcy5vYnNjdXJpdHkgPT09IFwiXCIpIHtcbiAgICAgIGF3YWl0IHRoaXMuZGVsYXkoMTAwMCk7XG4gICAgfVxuXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh0aGlzLmVsZW1lbnQuYWN0aW9uLCB7XG4gICAgICBtZXRob2Q6IFwicG9zdFwiLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkocGF5bG9hZCksXG4gICAgfSk7XG4gICAgY29uc3QgZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICBpZiAoIWRhdGEudmFsaWQpIHtcbiAgICAgIHRoaXMucHJvcGFnYXRlRXJyb3JzKGRhdGEuZXJyb3JzKVxuICAgICAgcmV0dXJuIDBcbiAgICB9XG5cbiAgICBpZiAoIWRhdGEuaGFzaFZhbGlkKSB7XG4gICAgICB0aGlzLnRva2VuID0gZGF0YS5uZXdIYXNoXG4gICAgICB0aGlzLm9ic2N1cml0eSA9ICcnXG4gICAgICB0aGlzLmhhc2hJbml0KClcbiAgICAgIGNvbnNvbGUud2FybignSGFzaCBoYWQgZXhwaXJlZC4gUmUtc3VibWl0dGluZyB3aXRoIG5ldyBoYXNoLiBQZXJmb3JtYW5jZSBtYXkgYmUgd29yc2UgZm9yIHRoaXMgc3BlY2lmaWMgcmVxdWVzdCcpXG4gICAgICByZXR1cm4gdGhpcy5zdWJtaXQoKVxuICAgIH1cblxuICAgIGlmICh0aGlzLnJlZGlyZWN0KSB7XG4gICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IHRoaXMucmVkaXJlY3RcbiAgICB9IGVsc2UgaWYgKHRoaXMuc3VjY2Vzc01lc3NhZ2UpIHtcbiAgICAgIHRoaXMuc3VjY2Vzc01lc3NhZ2Uuc3R5bGUuZGlzcGxheSA9ICdibG9jaydcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS53YXJuKCdGb3JtIHN1Ym1pdCB3YXMgc3VjY2Vzc2Z1bGwsIGJ1dCBuZWl0aGVyIGEgcmVkaXJlY3Qgbm9yIGEgc3VjY2VzcyBtZXNzYWdlIGVsZW1lbnQgYXJlIHByZXNlbnQnKVxuICAgIH1cbiAgICB0aGlzLmVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ3N1Y2Nlc3MnKSlcbiAgfVxuXG4gIHByb3BhZ2F0ZUVycm9ycyhlcnJvcnMpIHtcbiAgICBmb3IgKGNvbnN0IGVycm9yIG9mIGVycm9ycykge1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBvZiB0aGlzLmZpZWxkcykge1xuICAgICAgICBpZiAoZmllbGQubmFtZSA9PT0gZXJyb3IpIHtcbiAgICAgICAgICBmaWVsZC5zaG93RXJyb3IoKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZGVsYXkobWlsbGlzZWNvbmRzKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICBzZXRUaW1lb3V0KHJlc29sdmUsIG1pbGxpc2Vjb25kcyk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBoYXNoQ2FzaChudW0gPSAwKSB7XG4gICAgY29uc3QgdGV4dCA9IGAke3RoaXMudG9rZW59OiR7bnVtfWA7XG4gICAgY29uc3QgZGlnZXN0ID0gYXdhaXQgdGhpcy5zaGExKHRleHQpO1xuICAgIGNvbnN0IGNoZWNrID0gZGlnZXN0LnNsaWNlKDAsIDQpO1xuICAgIGxldCB2YWxpZCA9IHRydWU7XG4gICAgZm9yIChjb25zdCB2YWwgb2YgY2hlY2spIHtcbiAgICAgIGlmICh2YWwgIT09IFwiMFwiKSB7XG4gICAgICAgIHZhbGlkID0gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuICAgIGlmICh2YWxpZCkge1xuICAgICAgcmV0dXJuIG51bTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHRoaXMuaGFzaENhc2gobnVtICsgMSk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgc2hhMShtZXNzYWdlKSB7XG4gICAgY29uc3QgbXNnQnVmZmVyID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKG1lc3NhZ2UpO1xuICAgIGNvbnN0IGhhc2hCdWZmZXIgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmRpZ2VzdChcIlNIQS0xXCIsIG1zZ0J1ZmZlcik7XG4gICAgY29uc3QgaGFzaEFycmF5ID0gQXJyYXkuZnJvbShuZXcgVWludDhBcnJheShoYXNoQnVmZmVyKSk7XG4gICAgcmV0dXJuIGhhc2hBcnJheS5tYXAoKGIpID0+IGIudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsIFwiMFwiKSkuam9pbihcIlwiKTtcbiAgfVxuXG59XG4iLCAiaW1wb3J0IENvbnRhY3RGb3JtIGZyb20gXCIuL0NvbnRhY3RGb3JtXCI7XG5cbndpbmRvdy5iZWFybHkgPSB7fVxud2luZG93LmJlYXJseS5sb2FkZm9ybXMgPSAoKSA9PiB7XG4gIGZvciAoY29uc3QgZm9ybSBvZiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKFwiZm9ybVwiKSkge1xuICAgIGlmIChmb3JtLmRhdGFzZXRbXCJzbWFydFwiXSAmJiBmb3JtLmRhdGFzZXRbXCJzbWFydFwiXSA9PT0gXCJ0cnVlXCIpIHtcbiAgICAgIGNvbnN0IGZvcm1PYmogPSBuZXcgQ29udGFjdEZvcm0oZm9ybSk7XG4gICAgfVxuICB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOztBQUFBLE1BQXFCLFlBQXJCLE1BQStCO0FBQUEsSUFDN0IsUUFBUSxDQUFDO0FBQUEsSUFFVCxZQUFZLE9BQU87QUFDakIsV0FBSyxRQUFRO0FBQUEsSUFDZjtBQUFB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
