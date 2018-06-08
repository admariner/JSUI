import React, { Component } from 'react';

import { observable, computed, action } from 'mobx';
import { observer } from 'mobx-react';
import Fuse from 'fuse.js';

import * as S from './styles';
import Dialog from 'components/Dialog';
import keydown, { Keys } from 'react-keydown';
import { cycleValueAround } from 'utils';

@observer
class PopupSelector extends Component {
  inputRef = React.createRef();
  itemsRef = React.createRef();

  @observable highlightedItem = null;
  @observable search = '';
  searchOptions = {
    shouldSort: true,
    includeScore: true,
    includeMatches: true,
    threshold: 0.6,
    location: 0,
    distance: 100,
    maxPatternLength: 32,
    minMatchCharLength: 1,
    keys: [
      "name"
    ]
  };

  // encase we decide to use other search tools
  // we will map the fuse result into a general
  // result that's not tied to fuse's ways
  // expected shape of object returned
  /*

  {
    item: #this.props.items[one of em]#, // for this search result, this is the original item
    searchResults: {
      confidence: 0.8, // out of 1, how close to the search is this
      chunks: [ // fuzzy search can match multiple parts, where did this match?
        {
          str: 'ma',
          isMatch: true,
        },
        {
          str: 'tch ',
          isMatch: false,
        },
        {
          str: 're',
          isMatch: true,
        },
        {
          str: 'sult',
          isMatch: false,
        },
      }
    }
  }

   */
  //
  mapSearchResult = fuseResult => {
    const { item, matches, score } = fuseResult || {};
    const { name: itemName } = item || {};

    // we build the search result chunks off of the fuse match that retuns from the name
    // part of the search (see fuse options under keys, you can search multiple keys
    // in fuse and each key search match will result in a matches item. we need the
    // search on name
    const nameSearchMatch = matches.find(({value: matchValue}) => matchValue === itemName);
    const { indices } = nameSearchMatch;

    // itterates over the string of the search result forming chunks
    // whenever we reach the end of an indicy
    const chunks = itemName.split('').reduce((accumulator, character, index) => {
      const completeChunks = accumulator.slice(0, -1);
      const currentChunk = accumulator.slice(accumulator.length - 1)[0];
      const { str: currentChunkStr } = currentChunk;
      const newIndicy = indices.find(([start, end]) =>  start === index);
      const completeIndicy = indices.find(([start, end]) =>  end === index);

      // if the end of an indicy was found, we can
      // mark this chunk as isMatch and start a new chunk
      // todo: if start and end of indicy match, it could be
      // a end of a non indicy, so cut it off
      if (completeIndicy) {
        return [
          ...completeChunks,
          {
            str: currentChunkStr + character,
            isMatch: true,
          },
          {
            str: '',
            isMatch: false,
          },
        ];
      }

      if (newIndicy) {
        // end current chunk as we are at a new indicy
        // a filter  at the bottom will remove empty chunks
        // so no worry!
        return [
          ...completeChunks,
          {
            str: currentChunkStr + character,
            isMatch: false,
          },
          {
            str: '',
            isMatch: false,
          },
        ];
      }

      // no match, therefore we are still looking for this chunks end
      return [
        ...completeChunks,
        {
          str: currentChunkStr + character,
          isMatch: false,
        },
      ]
    }, [{str: '', isMatch: false}])
      .filter(({str}) => str !== ''); // last item can be empty, remove if so

    const searchResults = {
      confidence: 1 - score, // fuse uses 0 as best result and 1 as worse. this inverts that
      chunks,
    }

    return {
      item,
      searchResults,
    };
  };

  @computed
  get foundItems() {
    var fuse = new Fuse(this.props.items, this.searchOptions); // "list" is the item array
    var result = fuse.search(this.search);
    return result.map(this.mapSearchResult);
  }

  @action
  setHighlighted = id => {
    this.highlightedItem = id;
    if (this.inputRef && this.inputRef.current) {
      this.inputRef.current.focus();
    }
    const $element = document.getElementById(`item-${id}`);
    const $items = this.itemsRef.current;
    if (!($element && $items)) {
      return null;
    }

    const elementWithOffset = $element.offsetTop + $element.offsetHeight;
    const itemsWithOffset = $items.offsetHeight + $items.scrollTop;
    const isInView = elementWithOffset <= itemsWithOffset && $element.offsetTop >= $items.scrollTop;

    if (!isInView) {
      $items.scrollTop = elementWithOffset - $items.offsetHeight;
    }
  };

  @action
  setSearch = t => {
    this.search = t;
  };

  @keydown([Keys.up, Keys.down])
  onKeyOutside(e) {
    this.onkeyDown(e);
  }

  componentDidMount() {
    if (this.highlightedItem === null) {
      this.setHighlighted(this.props.items[0].id);
    }
  }

  onChange = e => {
    this.setSearch(e.target.value);
    const { item } = this.foundItems[0] || {};
    const { id: firstItemId = null } = item || {};
    this.setHighlighted(firstItemId);
  };

  close = () => {
    this.props.onEsc && this.props.onEsc();
  };

  onkeyDown = e => {
    const { foundItems: items } = this;

    if (e.keyCode === Keys.enter) {
      const foundItem = items.find(({item}) => item.id === this.highlightedItem);
      return this.choose(foundItem);
    }

    if (e.keyCode === Keys.esc) {
      return this.close();
    }

    if (e.keyCode === Keys.up || e.keyCode === Keys.down) {
      const index = items.findIndex(i => i.id === this.highlightedItem);
      let change = e.keyCode === Keys.up ? -1 : 1;
      const nextIndex = cycleValueAround(index, change, items.length);
      let nextItem = items[nextIndex];
      if (nextItem) {
        this.setHighlighted(nextItem.id);
      }
    }
  };

  choose = item => {
    const { onChoose, closeOnChoose } = this.props;
    onChoose && onChoose(item);
    if (closeOnChoose === true) {
      this.close();
    }
  };

  render() {
    const { inPortal, showSearch, renderItem, onEsc, overrides } = this.props;
    const { highlightedItem, foundItems: items } = overrides || this;

    return (
      <S.PopupSelector>
        <Dialog onClose={onEsc} onEsc={onEsc} autoHeight={true} inPortal={inPortal}>
          <S.Search>
            {showSearch && (
              <S.Input
                onChange={this.onChange}
                innerRef={this.inputRef}
                onKeyDown={this.onkeyDown}
                autoFocus
                placeholder="Search..."
              />
            )}
            <S.Items innerRef={this.itemsRef}>
              {items.map(({item, searchResults}) => (
                <S.Item
                  id={`item-${item.id}`}
                  isHighlighted={item.id === highlightedItem}
                  onDoubleClick={() => this.choose(item)}
                  onClick={() => this.setHighlighted(item.id)}
                  key={item.id}
                >
                  {renderItem ? renderItem(item, searchResults) : item.name}
                </S.Item>
              ))}
            </S.Items>
          </S.Search>
        </Dialog>
      </S.PopupSelector>
    );
  }
}

export default PopupSelector;
