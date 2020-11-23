<template>
    <div class="Preview">
        <div class="preview" v-html="mdown"></div>
    </div>
</template>

<script>
import axios from 'axios'

const root_path = "/edit/mark/"
const axios_config = {}

export default {
    props:["content"],
    data(){
        return {
            mdown: ""
        }
    },
    methods:{
        async compiledMarkdown() {
            let response = await axios.put(root_path, this.content, axios_config)
            this.mdown = response.data.content
        },
    },
    watch:{
        content(value){
            this.compiledMarkdown()
        }
    },
    created() {
        this.compiledMarkdown()
    },
}
</script>

<style lang="css">
.Preview{
    overflow: auto;
    width: 100%;
    height: calc(100% - 21px);
}
.preview{
    margin: 1em;
}
.preview h1{
    font-size: 1.5em;
    font-weight: bold;
    margin-bottom: 0.75em;
}
.preview h2{
    font-size: 1.25em;
    font-weight: bold;
    margin-bottom: 0.50em;
}
.preview h3{
    font-size: 1.125em;
    font-weight: bold;
    margin-bottom: 0.25em;
}
.preview img {
    max-width: 120px;
}
.preview ul ul, .preview ul ol, .preview ol ol, .preview ol ul, .preview dd{
    margin-left: 1em;
}
.preview p, .preview pre, .preview dl{
    margin-bottom: 0.75em;
}
.preview code {
    color: #f66;
}
.preview table{
    border-collapse: collapse;
    border: 1px solid lightgray;
    width:100%;
    margin: 0.5em 0;
}
.preview th, .preview td{
    border: 1px solid lightgray;
    padding: 2px;
}
.preview th{
    text-align: center;
    font-weight: bolder;
}
.preview .twemoji{
    width: 1em;
    height: 1em;
}

.preview sub, .preview sup {
  /* Specified in % so that the sup/sup is the
     right size relative to the surrounding text */
  font-size: 75%;

  /* Zero out the line-height so that it doesn't
     interfere with the positioning that follows */
  line-height: 0;

  /* Where the magic happens: makes all browsers position
     the sup/sup properly, relative to the surrounding text */
  position: relative;

  /* Note that if you're using Eric Meyer's reset.css, this
     is already set and you can remove this rule */
  vertical-align: baseline;
}

.preview sup {
  /* Move the superscripted text up */
  top: -0.5em;
}

.preview sub {
  /* Move the subscripted text down, but only
     half as far down as the superscript moved up */
  bottom: -0.25em;
}
</style>