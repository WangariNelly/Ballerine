
<script lang="ts">
  import { Steps } from '../contexts/configuration';

  export let stepName: typeof Steps;
</script>

<div class="container">
  <h1>Review Your Information</h1>
  <p>Step: {stepName}</p>
</div>

<style>
  .container {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    text-align: center;
    font-size: 2rem;
    font-weight: bold;
  }
</style>
