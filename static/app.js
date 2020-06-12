const app = new Vue({
  el: '#app',
  data: {
    commonName: '',
    subjAltNames: '',
    error: '',
    formVisible: true,
    created: null,
    privateKey: null,
    csr: null,
    performance: null,
  },
  methods: {
    async createCsr() {
      const t0 = performance.now();

      this.error = '';
      const response = await fetch('/csr', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          cn: this.commonName,
          san: this.subjAltNames || undefined
        })
      });
      const result = await response.json();
      console.log((result.privateKey).replace("\r\n", "\n"));
      console.log((result.signingRequest).replace("\r\n", "\n"));
      if (response.ok) {
        this.formVisible = false;
        this.created = true;
        this.privateKey = (result.privateKey).replace("\r\n", "\n");
        this.performance = `took: ${performance.now() - t0} ms`;
        this.csr = result.signingRequest;
      } else {
        this.error = result.message;
      }
    }
  }
})
