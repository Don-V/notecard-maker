const fs = require('fs');
const path = require('path');
// var filePath = "./data/test_note.txt";

class NoteParser{
  constructor(note_data){
    this.pointer = 0;
    this.headerRef;
    this.topic;
    this.note = {
      _meta : {},
      header : [],
      highlight : {},
      parens : [],
      lists : {},
      plain : []
    };
    this.cards = [];
    this.lines = note_data.split('\n').filter((line) => {
      return line.trim().length > 0 && !line.startsWith('//');
    }).map((line) => {
      return line.split(".").join('\uFF0E');
    }); //consider .reduce() vs .filter() & .map()
    this.grammar = {
      '!' : (data) => {
        return this.note._meta[data.substring(1, data.indexOf(':'))] = data.substr(data.indexOf(':') + 1).trim();
      },
      '#' : (data, lineNum) => {
        let i;
        for (i = 0; (i < data.length && data.charAt(i) == '#'); i++);
        if (this.note.header[i] === undefined) this.note.header[i] = [];
        let dataObj = {};
        this.topic = data.substr(i);
        dataObj[data.substr(i)] = lineNum;
        this.note.header[i].push(dataObj);
        this.note.header[i][this.note.header[i].length - 1] = {};
        this.headerRef = this.note.header[i][this.note.header[i].length - 1];
      },
      '$' : (data) => {
        this.topic = data.substr(1);
        this.headerRef[this.topic] = {};
        this.headerRef = this.headerRef[this.topic];
      },
      '*' : (data) => {
        let highlight;
        for (let i = data.indexOf('*'); i < data.length && i != -1; ){
          let nxt_idx = data.indexOf('*', i + 1);
          if (nxt_idx == -1){
            nxt_idx = data.indexOf(' ', i + 1);
            if (nxt_idx == -1) nxt_idx = data.length;
          }else if (nxt_idx + 1 < data.length && data.charAt(nxt_idx + 1) === '('){
            highlight = this.grammar['('](data, data.substring(i + 1, nxt_idx));
          }
          highlight = data.substring(i + 1, nxt_idx);
          
          this.note.highlight[highlight] = this.topic;
          i = data.indexOf('*', nxt_idx + 1);
        }
        return data.trim().split('*').join('');
      },
      '(' : (data, subhead) => {
        /*TODO: use infix/postfix to get a perfecr order*/
        let result;
        addParenLoop:
        for (let i = data.indexOf('('); i < data.length && i != -1; i = data.indexOf('(', i + 1)){
          let nxt_idx = data.indexOf(')');
          if (nxt_idx == -1){
            nxt_idx = data.length;
          }
          if (subhead === undefined){
            subhead = data.substring(0, i);
            for (let j = i - 1; j >= 0; j--){
              if (data.charAt(j) === ' '){
                subhead = data.substring(j + 1, i);
                break;
              }
            }
          }
          let data_obj = {};
          data_obj[subhead] = data.substring(i + 1, nxt_idx);
          for (let paren of this.note.parens){
            if (paren[Object.getOwnPropertyNames(paren)[0]] === data_obj[subhead]) {
              subhead = undefined; //this is set to undefined sp new topics are generated for the parens after it
              continue addParenLoop;
            }
          }
          this.note.parens.push(data_obj);
          subhead = undefined; //same as above
        }
        return true;
      },
      ':' : (data) => {
        let idx;
        if ((idx = data.indexOf(':')) === -1) return false;
        let topic = data.substring(0, idx);
        this.note.lists[topic] = [];
        if (idx == data.length - 1){
          let i = this.pointer;
          for (i = this.pointer + 1; i < this.lines.length; i++){
            if (this.lines[i].substr(0, 2) !== "- " && i != this.pointer + 1 && !Number.isInteger(parseInt(this.lines[i].charAt(0)))) break;//TODO move up
            this.note.lists[topic].push(this.grammar['*'](this.lines[i]));
          }
          this.pointer = i - 1;
        }else{
          let strList = data.substring(idx + 1);
          if (strList.charAt(strList.length - 1) === '\uFF0E') strList = strList.substring(0, strList.length - 1);
          this.note.lists[topic] = strList.split(',').map(item => {return item.trim()});
          return true;
        }
        return true;
      },
      'plain' : (data) => {
        let data_obj = {};
        data_obj[data] = this.topic;
        this.note.plain.push(data_obj);
      }
    };//grammar object
  }//constructor
  makeNoteCards(highlight = true, parens = true, lists = true, plain = true){ /*TODO: split all in four so user can select what type of cards*/
    this.cards = [];
    /*Parens*/
    if (parens){
      this.cards = [...this.cards, ...this.note.parens.map(obj => {
        return [Object.keys(obj)[0], obj[Object.keys(obj)[0]]];
      })];
    }
    
    // /*Highlights and lists*/
    if (highlight || lists){
      this.cards = [...this.cards, ...[...Object.keys(this.note.highlight), ...Object.keys(this.note.lists)].map((key, idx, keys) => {
        return (this.note.highlight.hasOwnProperty(key)) ? [this.note.highlight[key], key] : [key, this.note.lists[key]]; /*TODO: might not be good if highlights and lists have the same keys*/
      })];
    }
    
    /*Plain*/
    if (plain){
      this.cards = [...this.cards, ...this.note.plain.map(obj => {
        return [obj[Object.keys(obj)[0]], Object.keys(obj)[0]];
      })];
    }
      }
  parseMeta(){
    this.pointer = 0;//TODO should this method reset the pointer member?
    let next = this.lines[this.pointer];
    while(next.charAt(0) == '!'){
      this.grammar['!'](next);
      next = this.lines[++this.pointer];
    }
  }
  parseNotes(){
    let idx = this.pointer;
    let next = this.lines[this.pointer];
    while(this.pointer < this.lines.length){
      if (next.charAt(0) == '#'){/*TODO: headers doesn't work correctly*/
        this.grammar['#'](next, this.pointer);
      }else if (next.charAt(0) == '$'){
        this.grammar.$(next, this.pointer);
      }else if (this.headerRef){
        let formatted = this.grammar['*'](next);
        this.grammar['('](next);
        if (!this.grammar[':'](next))
          this.grammar.plain(formatted);
      }
      next = this.lines[++this.pointer];
    }
  }
  parseResult(){
    this.parseMeta();
    this.parseNotes();
    this.makeNoteCards();
    return this.cards;
  }
}


// var contents;
// fs.readFile(filePath, 'UTF-8', (err, data) => {
//   if (err)
//     console.error(err);
//   contents = data;
//   // let firstline = contents.split("\n")[0];
//   let temp = "Soccer is a wonderful sport which is pretty much the *best* sport in the world. It is played by *over 200 countries*(which is all the countries in the world).";
//   let np = new NoteParser(contents);
//   // console.log(np.grammar['#'](temp));
//   np.parseMeta();
//   np.parseNotes();
//   // console.log(np.grammar['*'](temp));
//   console.log(np.note.header[2]);
//   console.log("------------------\n");
//   // console.log(np.note.lists);
//   np.makeNoteCards();
//   console.log(np.cards);

// });

module.exports = NoteParser;