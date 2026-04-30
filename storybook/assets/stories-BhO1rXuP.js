var B=Object.defineProperty;var F=(t,e,i)=>e in t?B(t,e,{enumerable:!0,configurable:!0,writable:!0,value:i}):t[e]=i;var p=(t,e,i)=>F(t,typeof e!="symbol"?e+"":e,i);import{n as G,N as j,f as H,c as R,G as C,S as N,a as U,w as P}from"./sigma-BdB3I2ax.js";import"./_commonjsHelpers-C4iS2aBk.js";function k({slices:t,offset:e}){return`
precision highp float;

varying vec2 v_diffVector;
varying float v_radius;

#ifdef PICKING_MODE
varying vec4 v_color;
#else
// For normal mode, we use the border colors defined in the program:
${t.flatMap(({value:n},a)=>"attribute"in n?[`varying float v_sliceValue_${a+1};`]:[]).join(`
`)}
${t.map(({color:n},a)=>"attribute"in n?`varying vec4 v_sliceColor_${a+1};`:`uniform vec4 u_sliceColor_${a+1};`).join(`
`)}
#endif

uniform vec4 u_defaultColor;
uniform float u_cameraAngle;
uniform float u_correctionRatio;

${"attribute"in e?`varying float v_offset;
`:""}
${"value"in e?`uniform float u_offset;
`:""}

const float bias = 255.0 / 254.0;
const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  float aaBorder = u_correctionRatio * 2.0;;
  float dist = length(v_diffVector);
  float offset = ${"attribute"in e?"v_offset":"u_offset"};
  float angle = atan(v_diffVector.y / v_diffVector.x);
  if (v_diffVector.x < 0.0 && v_diffVector.y < 0.0) angle += ${Math.PI};
  else if (v_diffVector.x < 0.0) angle += ${Math.PI};
  else if (v_diffVector.y < 0.0) angle += ${2*Math.PI};
  angle = angle - u_cameraAngle + offset;
  angle = mod(angle, ${2*Math.PI});

  // No antialiasing for picking mode:
  #ifdef PICKING_MODE
  if (dist > v_radius)
    gl_FragColor = transparent;
  else {
    gl_FragColor = v_color;
    gl_FragColor.a *= bias;
  }
  #else
  // Colors:
${t.map(({color:n},a)=>{const c=[];return"attribute"in n?c.push(`  vec4 sliceColor_${a+1} = v_sliceColor_${a+1};`):"transparent"in n?c.push(`  vec4 sliceColor_${a+1} = vec4(0.0, 0.0, 0.0, 0.0);`):c.push(`  vec4 sliceColor_${a+1} = u_sliceColor_${a+1};`),c.push(`  sliceColor_${a+1}.a *= bias;`),c.join(`
`)}).join(`
`)}
  vec4 color = u_defaultColor;
  color.a *= bias;

  // Sizes:
${t.map(({value:n},a)=>`  float sliceValue_${a+1} = ${"attribute"in n?`v_sliceValue_${a+1}`:G(n.value)};`).join(`
`)}

  // Angles and final color:
  float total = ${t.map((n,a)=>`sliceValue_${a+1}`).join(" + ")};
  float angle_0 = 0.0;
  if (total > 0.0) {
${t.map((n,a)=>`    float angle_${a+1} = angle_${a} + sliceValue_${a+1} * ${2*Math.PI} / total;`).join(`
`)}
    ${t.map((n,a)=>`if (angle < angle_${a+1}) color = sliceColor_${a+1};`).join(`
    else `)}
  }

  if (dist < v_radius - aaBorder) {
    gl_FragColor = color;
  } else if (dist < v_radius) {
    gl_FragColor = mix(transparent, color, (v_radius - dist) / aaBorder);
  }
  #endif
}
`}function K({slices:t,offset:e}){return`
attribute vec4 a_id;
attribute vec2 a_position;
attribute float a_size;
attribute float a_angle;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;

varying vec2 v_diffVector;
varying float v_radius;

${"attribute"in e?`attribute float a_offset;
`:""}
${"attribute"in e?`varying float v_offset;
`:""}

#ifdef PICKING_MODE
varying vec4 v_color;
#else
${t.flatMap(({value:n},a)=>"attribute"in n?[`attribute float a_sliceValue_${a+1};`,`varying float v_sliceValue_${a+1};`]:[]).join(`
`)}
${t.flatMap(({color:n},a)=>"attribute"in n?[`attribute vec4 a_sliceColor_${a+1};`,`varying vec4 v_sliceColor_${a+1};`]:[]).join(`
`)}
#endif

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main() {
  float size = a_size * u_correctionRatio / u_sizeRatio * 4.0;
  vec2 diffVector = size * vec2(cos(a_angle), sin(a_angle));
  vec2 position = a_position + diffVector;
  gl_Position = vec4(
    (u_matrix * vec3(position, 1)).xy,
    0,
    1
  );

  v_radius = size / 2.0;
  v_diffVector = diffVector;
  ${"attribute"in e?`v_offset = a_offset;
`:""}

  #ifdef PICKING_MODE
  v_color = a_id;
  #else
${t.flatMap(({value:n},a)=>"attribute"in n?[`  v_sliceValue_${a+1} = a_sliceValue_${a+1};`]:[]).join(`
`)}
${t.flatMap(({color:n},a)=>"attribute"in n?[`  v_sliceColor_${a+1} = a_sliceColor_${a+1};`]:[]).join(`
`)}
  #endif
}
`}const y="#000000",W={drawLabel:void 0,drawHover:void 0,defaultColor:y,offset:{value:0}},{UNSIGNED_BYTE:A,FLOAT:m}=WebGLRenderingContext;function x(t){var l;const e={...W,...t},{slices:i,offset:n,drawHover:a,drawLabel:c}=e,v=["u_sizeRatio","u_correctionRatio","u_cameraAngle","u_matrix","u_defaultColor",..."value"in n?["u_offset"]:[],...i.flatMap(({color:b},f)=>"value"in b?[`u_sliceColor_${f+1}`]:[])];return l=class extends j{constructor(){super(...arguments);p(this,"drawLabel",c);p(this,"drawHover",a)}getDefinition(){return{VERTICES:3,VERTEX_SHADER_SOURCE:K(e),FRAGMENT_SHADER_SOURCE:k(e),METHOD:WebGLRenderingContext.TRIANGLES,UNIFORMS:v,ATTRIBUTES:[{name:"a_position",size:2,type:m},{name:"a_id",size:4,type:A,normalized:!0},{name:"a_size",size:1,type:m},..."attribute"in n?[{name:"a_offset",size:1,type:m}]:[],...i.flatMap(({color:r},o)=>"attribute"in r?[{name:`a_sliceColor_${o+1}`,size:4,type:A,normalized:!0}]:[]),...i.flatMap(({value:r},o)=>"attribute"in r?[{name:`a_sliceValue_${o+1}`,size:1,type:m}]:[])],CONSTANT_ATTRIBUTES:[{name:"a_angle",size:1,type:m}],CONSTANT_DATA:[[l.ANGLE_1],[l.ANGLE_2],[l.ANGLE_3]]}}getProgramInfo(r,o,d,s,g){let u=4;"attribute"in n&&(u+=1),u+=i.reduce((_,{color:E,value:z})=>("attribute"in E&&(_+=1),"attribute"in z&&(_+=1),_),0);const h=o.getParameter(o.MAX_VERTEX_ATTRIBS);if(u>h)throw new Error(`createNodePiechartProgram: Too many slices. The node program requires ${u} vertex attributes, but the current WebGL context only supports ${h}. Please reduce the number of slices.`);return super.getProgramInfo(r,o,d,s,g)}processVisibleItem(r,o,d){const s=this.array;s[o++]=d.x,s[o++]=d.y,s[o++]=r,s[o++]=d.size,"attribute"in n&&(s[o++]=d[n.attribute]||0),i.forEach(({color:g})=>{"attribute"in g&&(s[o++]=H(d[g.attribute]||g.defaultValue||y))}),i.forEach(({value:g})=>{"attribute"in g&&(s[o++]=d[g.attribute]||0)})}setUniforms(r,{gl:o,uniformLocations:d}){const{u_sizeRatio:s,u_correctionRatio:g,u_cameraAngle:u,u_matrix:h,u_defaultColor:_}=d;o.uniform1f(g,r.correctionRatio),o.uniform1f(s,r.sizeRatio),o.uniform1f(u,r.cameraAngle),o.uniformMatrix3fv(h,!1,r.matrix),"value"in n&&o.uniform1f(d.u_offset,n.value);const[E,z,S,L]=R(e.defaultColor||y);o.uniform4f(_,E/255,z/255,S/255,L/255),i.forEach(({color:$},M)=>{if("value"in $){const T=d[`u_sliceColor_${M+1}`],[D,I,V,w]=R($.value);o.uniform4f(T,D/255,I/255,V/255,w/255)}})}},p(l,"ANGLE_1",0),p(l,"ANGLE_2",2*Math.PI/3),p(l,"ANGLE_3",4*Math.PI/3),l}const X=()=>{const t=document.getElementById("sigma-container"),e=new C;e.addNode("a",{x:0,y:0,size:20,label:"A",positive:10,neutral:17,negative:14}),e.addNode("b",{x:1,y:-1,size:40,label:"B",positive:2,neutral:4,negative:1}),e.addNode("c",{x:3,y:-2,size:20,label:"C",positive:0,neutral:8,negative:3}),e.addNode("d",{x:1,y:-3,size:20,label:"D",positive:0,negative:0}),e.addNode("e",{x:3,y:-4,size:40,label:"E",positive:17,neutral:1,negative:3}),e.addNode("f",{x:4,y:-5,size:20,label:"F",neutral:8,negative:4}),e.addEdge("a","b",{size:10}),e.addEdge("b","c",{size:10}),e.addEdge("b","d",{size:10}),e.addEdge("c","b",{size:10}),e.addEdge("c","e",{size:10}),e.addEdge("d","c",{size:10}),e.addEdge("d","e",{size:10}),e.addEdge("e","d",{size:10}),e.addEdge("f","e",{size:10});const i=x({defaultColor:"#BCB7C4",slices:[{color:{value:"#F05454"},value:{attribute:"negative"}},{color:{value:"#7798FA"},value:{attribute:"neutral"}},{color:{value:"#6DDB55"},value:{attribute:"positive"}}]}),n=new N(e,t,{defaultNodeType:"piechart",nodeProgramClasses:{piechart:i}});return()=>{n.kill()}},q=`import { createNodePiechartProgram } from "@sigma/node-piechart";
import Graph from "graphology";
import Sigma from "sigma";

export default () => {
  const container = document.getElementById("sigma-container") as HTMLElement;

  const graph = new Graph();

  graph.addNode("a", {
    x: 0,
    y: 0,
    size: 20,
    label: "A",
    positive: 10,
    neutral: 17,
    negative: 14,
  });
  graph.addNode("b", {
    x: 1,
    y: -1,
    size: 40,
    label: "B",
    positive: 2,
    neutral: 4,
    negative: 1,
  });
  graph.addNode("c", {
    x: 3,
    y: -2,
    size: 20,
    label: "C",
    positive: 0,
    neutral: 8,
    negative: 3,
  });
  graph.addNode("d", {
    x: 1,
    y: -3,
    size: 20,
    label: "D",
    positive: 0,
    negative: 0,
  });
  graph.addNode("e", {
    x: 3,
    y: -4,
    size: 40,
    label: "E",
    positive: 17,
    neutral: 1,
    negative: 3,
  });
  graph.addNode("f", {
    x: 4,
    y: -5,
    size: 20,
    label: "F",
    neutral: 8,
    negative: 4,
  });

  graph.addEdge("a", "b", { size: 10 });
  graph.addEdge("b", "c", { size: 10 });
  graph.addEdge("b", "d", { size: 10 });
  graph.addEdge("c", "b", { size: 10 });
  graph.addEdge("c", "e", { size: 10 });
  graph.addEdge("d", "c", { size: 10 });
  graph.addEdge("d", "e", { size: 10 });
  graph.addEdge("e", "d", { size: 10 });
  graph.addEdge("f", "e", { size: 10 });

  const NodePiechartProgram = createNodePiechartProgram({
    defaultColor: "#BCB7C4",
    slices: [
      { color: { value: "#F05454" }, value: { attribute: "negative" } },
      { color: { value: "#7798FA" }, value: { attribute: "neutral" } },
      { color: { value: "#6DDB55" }, value: { attribute: "positive" } },
    ],
  });
  const renderer = new Sigma(graph, container, {
    defaultNodeType: "piechart",
    nodeProgramClasses: {
      piechart: NodePiechartProgram,
    },
  });

  return () => {
    renderer.kill();
  };
};
`,Y=()=>{const t=document.getElementById("sigma-container"),e=new C,i="#956b5e",n="#ff44de",a="#71db97",c="#ff813b";e.addNode("a",{x:0,y:0,size:20,label:"A",colors:[i]}),e.addNode("b",{x:1,y:-1,size:40,label:"B",colors:[i,n,a]}),e.addNode("c",{x:3,y:-2,size:20,label:"C",colors:[n]}),e.addNode("d",{x:1,y:-3,size:20,label:"D",colors:[n,a]}),e.addNode("e",{x:3,y:-4,size:40,label:"E",colors:[n,a,c]}),e.addNode("f",{x:4,y:-5,size:20,label:"F",colors:[c]}),e.addEdge("a","b",{size:10}),e.addEdge("b","c",{size:10}),e.addEdge("b","d",{size:10}),e.addEdge("c","b",{size:10}),e.addEdge("c","e",{size:10}),e.addEdge("d","c",{size:10}),e.addEdge("d","e",{size:10}),e.addEdge("e","d",{size:10}),e.addEdge("f","e",{size:10});const v=Math.max(...e.mapNodes((f,{colors:r})=>r.length)),l={...U};for(let f=2;f<=v;f++){const r=[{color:{attribute:"color"},value:{value:1}}];for(let o=1;o<f;o++)r.push({color:{attribute:`color-${o}`},value:{value:1}});l[`pie-${f}`]=x({slices:r})}const b=new N(e,t,{nodeProgramClasses:l,nodeReducer:(f,r)=>{const o=r.colors;r.type=o.length<=1?"circle":`pie-${o.length}`,r.color=o[0];for(let d=1;d<o.length;d++)r[`color-${d}`]=o[d];return r}});return()=>{b.kill()}},J=`import { CreateNodePiechartProgramOptions, createNodePiechartProgram } from "@sigma/node-piechart";
import Graph from "graphology";
import Sigma from "sigma";
import { DEFAULT_NODE_PROGRAM_CLASSES } from "sigma/settings";
import { NodeDisplayData } from "sigma/types";

export default () => {
  const container = document.getElementById("sigma-container") as HTMLElement;

  const graph = new Graph<Partial<NodeDisplayData> & { colors: string[] }>();

  const COLOR_1 = "#956b5e";
  const COLOR_2 = "#ff44de";
  const COLOR_3 = "#71db97";
  const COLOR_4 = "#ff813b";

  // This example shows how to render nodes that have multiple colors:
  graph.addNode("a", {
    x: 0,
    y: 0,
    size: 20,
    label: "A",
    colors: [COLOR_1],
  });
  graph.addNode("b", {
    x: 1,
    y: -1,
    size: 40,
    label: "B",
    colors: [COLOR_1, COLOR_2, COLOR_3],
  });
  graph.addNode("c", {
    x: 3,
    y: -2,
    size: 20,
    label: "C",
    colors: [COLOR_2],
  });
  graph.addNode("d", {
    x: 1,
    y: -3,
    size: 20,
    label: "D",
    colors: [COLOR_2, COLOR_3],
  });
  graph.addNode("e", {
    x: 3,
    y: -4,
    size: 40,
    label: "E",
    colors: [COLOR_2, COLOR_3, COLOR_4],
  });
  graph.addNode("f", {
    x: 4,
    y: -5,
    size: 20,
    label: "F",
    colors: [COLOR_4],
  });

  graph.addEdge("a", "b", { size: 10 });
  graph.addEdge("b", "c", { size: 10 });
  graph.addEdge("b", "d", { size: 10 });
  graph.addEdge("c", "b", { size: 10 });
  graph.addEdge("c", "e", { size: 10 });
  graph.addEdge("d", "c", { size: 10 });
  graph.addEdge("d", "e", { size: 10 });
  graph.addEdge("e", "d", { size: 10 });
  graph.addEdge("f", "e", { size: 10 });

  const maxCount = Math.max(...graph.mapNodes((_, { colors }) => colors.length));
  const nodeProgramClasses = { ...DEFAULT_NODE_PROGRAM_CLASSES };

  for (let i = 2; i <= maxCount; i++) {
    const slices: CreateNodePiechartProgramOptions["slices"] = [{ color: { attribute: "color" }, value: { value: 1 } }];
    for (let j = 1; j < i; j++) slices.push({ color: { attribute: \`color-\${j}\` }, value: { value: 1 } });
    nodeProgramClasses[\`pie-\${i}\`] = createNodePiechartProgram({
      slices,
    });
  }
  const renderer = new Sigma(graph, container, {
    nodeProgramClasses,
    nodeReducer: (_, data) => {
      const colors = data.colors as string[];
      data.type = colors.length <= 1 ? "circle" : \`pie-\${colors.length}\`;
      data.color = colors[0];
      for (let i = 1; i < colors.length; i++) data[\`color-\${i}\` as "color"] = colors[i];
      return data;
    },
  });

  return () => {
    renderer.kill();
  };
};
`,O=`<style>
  html,
  body,
  #storybook-root,
  #sigma-container {
    width: 100%;
    height: 100%;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden;
  }
</style>
<div id="sigma-container"></div>
`,Q=()=>{const t=document.getElementById("sigma-container"),e=new C;e.addNode("a",{x:0,y:0,size:20,label:"A"}),e.addNode("b",{x:1,y:-1,size:40,label:"B",offset:Math.PI/3}),e.addNode("c",{x:3,y:-2,size:20,label:"C",offset:Math.PI/2}),e.addNode("d",{x:1,y:-3,size:20,label:"D",offset:Math.PI}),e.addNode("e",{x:3,y:-4,size:40,label:"E",offset:Math.PI*2/3}),e.addNode("f",{x:4,y:-5,size:20,label:"F",offset:Math.PI*3/2}),e.addEdge("a","b",{size:10}),e.addEdge("b","c",{size:10}),e.addEdge("b","d",{size:10}),e.addEdge("c","b",{size:10}),e.addEdge("c","e",{size:10}),e.addEdge("d","c",{size:10}),e.addEdge("d","e",{size:10}),e.addEdge("e","d",{size:10}),e.addEdge("f","e",{size:10});const i=x({defaultColor:"#BCB7C4",offset:{attribute:"offset"},slices:[{color:{value:"yellow"},value:{value:1}},{color:{value:"orange"},value:{value:1}}]}),n=new N(e,t,{defaultNodeType:"piechart",nodeProgramClasses:{piechart:i}});return()=>{n.kill()}},Z=`import { createNodePiechartProgram } from "@sigma/node-piechart";
import Graph from "graphology";
import Sigma from "sigma";

export default () => {
  const container = document.getElementById("sigma-container") as HTMLElement;

  const graph = new Graph();

  graph.addNode("a", {
    x: 0,
    y: 0,
    size: 20,
    label: "A",
  });
  graph.addNode("b", {
    x: 1,
    y: -1,
    size: 40,
    label: "B",
    offset: Math.PI / 3,
  });
  graph.addNode("c", {
    x: 3,
    y: -2,
    size: 20,
    label: "C",
    offset: Math.PI / 2,
  });
  graph.addNode("d", {
    x: 1,
    y: -3,
    size: 20,
    label: "D",
    offset: Math.PI,
  });
  graph.addNode("e", {
    x: 3,
    y: -4,
    size: 40,
    label: "E",
    offset: (Math.PI * 2) / 3,
  });
  graph.addNode("f", {
    x: 4,
    y: -5,
    size: 20,
    label: "F",
    offset: (Math.PI * 3) / 2,
  });

  graph.addEdge("a", "b", { size: 10 });
  graph.addEdge("b", "c", { size: 10 });
  graph.addEdge("b", "d", { size: 10 });
  graph.addEdge("c", "b", { size: 10 });
  graph.addEdge("c", "e", { size: 10 });
  graph.addEdge("d", "c", { size: 10 });
  graph.addEdge("d", "e", { size: 10 });
  graph.addEdge("e", "d", { size: 10 });
  graph.addEdge("f", "e", { size: 10 });

  const NodePiechartProgram = createNodePiechartProgram({
    defaultColor: "#BCB7C4",
    offset: { attribute: "offset" },
    slices: [
      { color: { value: "yellow" }, value: { value: 1 } },
      { color: { value: "orange" }, value: { value: 1 } },
    ],
  });
  const renderer = new Sigma(graph, container, {
    defaultNodeType: "piechart",
    nodeProgramClasses: {
      piechart: NodePiechartProgram,
    },
  });

  return () => {
    renderer.kill();
  };
};
`,oe={id:"@sigma/node-piechart",title:"Satellite packages/@sigma--node-piechart"},te={name:"Fixed colors, varying values",render:()=>O,play:P(X),args:{},parameters:{storySource:{source:q}}},re={name:"Fixed values, varying colors",render:()=>O,play:P(Y),args:{},parameters:{storySource:{source:J}}},ie={name:"Varying offsets",render:()=>O,play:P(Q),args:{},parameters:{storySource:{source:Z}}};export{oe as default,te as fixedColors,re as fixedValues,ie as offsets};
